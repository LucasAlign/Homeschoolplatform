// Module D — offline queue reconciliation (pure logic, unit-tested).
//
// The essential daily loop survives offline (§16, invariant 7): work-start,
// assistance logging, evidence attachment, and submission are queued locally and
// replayed against server authority on reconnect. Reconciliation is deterministic
// and last-write-wins against the server:
//
//  - Ordering is total and stable: (clientTs, opId).
//  - Append-only ops (attach_evidence, support_event) always survive unless
//    already present on the server (idempotent dedup) — assistance and evidence
//    are never lost to a race.
//  - State transitions honor server authority: a transition that is not legal
//    from the reconciled state, or that lost the race to a newer server write,
//    is dropped rather than clobbering the server.

import { canTransition } from './submission-state-machine';
import type {
  DropReason,
  QueuedOp,
  ReconcileResult,
  SubmissionSnapshot,
} from './types';

/** Total, stable ordering of queued ops: by client timestamp, then opId. */
export function orderQueue(ops: QueuedOp[]): QueuedOp[] {
  return [...ops].sort((a, b) =>
    a.clientTs === b.clientTs ? (a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0) : a.clientTs - b.clientTs,
  );
}

/**
 * Replay a client's queued ops on top of the server-authoritative snapshot.
 * Pure: returns the reconciled snapshot plus the applied/dropped breakdown.
 * The caller commits the applied ops; dropped ops are surfaced to the client.
 */
export function reconcile(server: SubmissionSnapshot, ops: QueuedOp[]): ReconcileResult {
  const state: SubmissionSnapshot = {
    ...server,
    evidenceIds: [...server.evidenceIds],
    supportEventIds: [...server.supportEventIds],
  };
  const applied: QueuedOp[] = [];
  const dropped: { op: QueuedOp; reason: DropReason }[] = [];

  for (const op of orderQueue(ops)) {
    if (op.submissionId !== state.submissionId) {
      // Not for this submission; leave for that submission's reconciliation.
      continue;
    }

    if (op.kind === 'attach_evidence') {
      if (state.evidenceIds.includes(op.evidenceId)) {
        dropped.push({ op, reason: 'duplicate' });
      } else {
        state.evidenceIds.push(op.evidenceId);
        applied.push(op);
      }
      continue;
    }

    if (op.kind === 'support_event') {
      if (state.supportEventIds.includes(op.supportEventId)) {
        dropped.push({ op, reason: 'duplicate' });
      } else {
        state.supportEventIds.push(op.supportEventId);
        applied.push(op);
      }
      continue;
    }

    // Transition: honor server authority (LWW) and legality.
    if (op.to === state.state) {
      dropped.push({ op, reason: 'duplicate' });
      continue;
    }
    if (op.clientTs < state.updatedAt) {
      // The server moved on after this op was queued; the older client op loses.
      dropped.push({ op, reason: 'superseded_by_server' });
      continue;
    }
    if (!canTransition(state.state, op.to)) {
      dropped.push({ op, reason: 'illegal_transition' });
      continue;
    }
    state.state = op.to;
    state.updatedAt = op.clientTs;
    applied.push(op);
  }

  return { state, applied, dropped };
}
