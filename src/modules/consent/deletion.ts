// Module K — deletion-cascade plan generation + the immutability-vs-deletion rule
// (pure logic, unit-tested). docs/mvp-specification.md §14, §17 (invariant 5).
//
// Deletion is: reversible grace → CASCADING hard delete across every surface
// (DB / storage / indexes / embeddings / caches / logs / queues / exports /
// backups / subprocessors) → content-free deletion ledger → an honest ~180-day
// backup ceiling. A legal hold OVERRIDES and blocks the cascade. Deletion is
// export-first: a portable export must be offered/completed before the whole
// delete runs.
//
// Immutability ≠ non-existence: an Approved Portfolio Snapshot is UN-EDITABLE
// (invariant 5) but WHOLLY DELETABLE on an authorized, export-first request. The
// rule below rejects any edit and permits only a whole-delete.

import {
  DELETION_SURFACES,
  type DeletionMethod,
  type DeletionPlan,
  type DeletionRequest,
  type DeletionSurface,
  type DeletionSurfaceAction,
} from './types';

/** Default reversible grace before the cascade runs (day-count deferred, §21). */
export const DEFAULT_GRACE_PERIOD_DAYS = 30;

/**
 * Honest backup ceiling (§14): identifiable data may linger in rotating backups
 * up to ~180 days after the cascade. We never claim faster than the backups allow.
 */
export const BACKUP_CEILING_DAYS = 180;

/** How each surface is cleared in the cascade (content-free rationale in `note`). */
const SURFACE_METHOD: Record<DeletionSurface, { method: DeletionMethod; note: string }> = {
  database: { method: 'hard_delete', note: 'canonical Firestore docs hard-deleted' },
  storage: { method: 'hard_delete', note: 'Cloud Storage objects hard-deleted' },
  search_indexes: { method: 'hard_delete', note: 'search index entries removed' },
  embeddings: { method: 'hard_delete', note: 'vector embeddings removed' },
  caches: { method: 'hard_delete', note: 'ephemeral caches invalidated' },
  // Logs keep a content-free record: WHO/WHAT survives, identifiable content goes.
  logs: { method: 'retain_content_free', note: 'identifiable content scrubbed; content-free audit retained' },
  queues: { method: 'hard_delete', note: 'pending queue tasks purged' },
  exports: { method: 'hard_delete', note: 'generated export artifacts removed' },
  // Backups: honest ceiling — cleared on rotation, not immediately.
  backups: { method: 'purge_on_rotation', note: `cleared on backup rotation (~${BACKUP_CEILING_DAYS}d ceiling)` },
  // Subprocessors: deletion request propagated under the executed DPA (§15).
  subprocessors: { method: 'propagate_request', note: 'deletion propagated to subprocessors under DPA' },
};

/**
 * Generate the cascading deletion plan for a request. Pure: it computes the
 * surface-by-surface actions, the grace window, the backup ceiling, and whether a
 * legal hold blocks the cascade. It performs NO I/O — the executor (data-lifecycle.ts)
 * runs the plan and writes the content-free ledger.
 *
 * A legal hold produces a fully BLOCKED plan (no surface cleared). The cascade is
 * export-first: without a completed export the plan is blocked so the executor
 * cannot skip the export step.
 */
export function generateDeletionPlan(
  request: DeletionRequest,
  gracePeriodDays: number = DEFAULT_GRACE_PERIOD_DAYS,
): DeletionPlan {
  const base = {
    scope: request.scope,
    targetId: request.targetId,
    gracePeriodDays,
    backupCeilingDays: BACKUP_CEILING_DAYS,
    writesLedger: true as const,
  };

  if (request.legalHold) {
    return {
      ...base,
      surfaces: [],
      blocked: true,
      blockReason: 'legal hold in effect — deletion overridden',
    };
  }

  if (!request.exportCompleted) {
    return {
      ...base,
      surfaces: [],
      blocked: true,
      blockReason: 'export-first: a portable export must be completed before deletion',
    };
  }

  const surfaces: DeletionSurfaceAction[] = DELETION_SURFACES.map((surface) => {
    const spec = SURFACE_METHOD[surface];
    return {
      surface,
      method: spec.method,
      immediate: spec.method === 'hard_delete',
      note: spec.note,
    };
  });

  return { ...base, surfaces, blocked: false, blockReason: null };
}

/** The complete set of surfaces the cascade must cover (for coverage assertions). */
export function cascadeSurfaces(): readonly DeletionSurface[] {
  return DELETION_SURFACES;
}

// --- Immutability vs. deletion (§14, invariant 5) ---

export type RecordMutationOp = 'edit' | 'delete';

export interface MutationContext {
  /** The caller passed a fail-closed authorization for the operation. */
  authorized: boolean;
  /** Deletion is export-first; a completed export is required to whole-delete. */
  exportCompleted: boolean;
}

export interface MutationDecision {
  allowed: boolean;
  reason: string;
}

/**
 * The immutability-vs-deletion rule for an immutable-via-supersession record (a
 * Portfolio Snapshot, an Official Grade, a consent receipt): an EDIT is ALWAYS
 * rejected (immutability, invariant 5), while a whole DELETE is permitted only
 * when authorized AND export-first (mutation ≠ existence, §14). Pure and total.
 */
export function resolveImmutableRecordMutation(
  op: RecordMutationOp,
  ctx: MutationContext,
): MutationDecision {
  if (op === 'edit') {
    return { allowed: false, reason: 'record is immutable (edits are rejected; supersede instead)' };
  }
  // op === 'delete'
  if (!ctx.authorized) {
    return { allowed: false, reason: 'deletion requires a fail-closed authorization' };
  }
  if (!ctx.exportCompleted) {
    return { allowed: false, reason: 'deletion is export-first: complete a portable export first' };
  }
  return { allowed: true, reason: 'authorized, export-first whole-delete permitted' };
}
