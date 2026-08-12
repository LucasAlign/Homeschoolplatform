// Module G — Review & Notifications operations (server-only, Admin SDK).
//
// Review Flags and Notifications are server-written; clients never write them
// (Firestore rules deny it, and the server is the single writer). A flag is a
// NEUTRAL, evidence-backed request for adult attention: it is raised from a
// signal, routed to a cadence tier, and resolved ONLY by an adult through the
// fail-closed `authorize()` (invariant 3) — a Student never resolves a flag, and
// a flag never blocks essential learning (invariant 7). Every write is audited.

import { adminDb, FieldValue } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { assertCollectionAllowed } from '../consent/consent';
import { recordAudit } from '../audit/audit';
import { assertTransition, isResolutionOutcome } from './flag-state-machine';
import { classifySignal } from './signal-classification';
import { routeToTier } from './notification-routing';
import { aggregateForTier } from './aggregation';
import type {
  DigestBucket,
  Notification,
  NotificationEvent,
  ResolutionOutcome,
  ReviewFlag,
  ReviewSignal,
} from './types';

export class ReviewError extends Error {
  constructor(reason: string) {
    super(`review: ${reason}`);
    this.name = 'ReviewError';
  }
}

function flagsCol(hid: string) {
  return adminDb.collection(`households/${hid}/reviewFlags`);
}
function notificationsCol(hid: string) {
  return adminDb.collection(`households/${hid}/notifications`);
}

/**
 * Enqueue one routed notification (server-written). Pure `routeToTier` decides
 * the cadence tier; this persists the queued record and audits it. Adults read
 * notifications within scope; clients never write them.
 */
export async function enqueueNotification(args: {
  householdId: string;
  /** Producing subsystem / service identity (for the audit trail). */
  actorUid: string;
  event: NotificationEvent;
}): Promise<Notification> {
  const tier = routeToTier(args.event);
  const ref = notificationsCol(args.householdId).doc();
  const notification: Notification = {
    id: ref.id,
    tier,
    kind: args.event.kind,
    studentId: args.event.studentId,
    sourceRef: args.event.sourceRef,
    state: 'Queued',
    createdAt: Date.now(),
    deliveredAt: null,
  };
  await ref.create(notification);

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.actorUid,
    action: 'write',
    recordType: 'notification',
    recordId: ref.id,
    studentId: args.event.studentId,
    detail: `notification kind=${args.event.kind} tier=${tier} (queued)`,
  });
  return notification;
}

/**
 * Raise a Review Flag FROM a signal. System-invoked by a signal producer (a
 * worker / another module), not a client action — so it consent-gates and audits
 * rather than calling `authorize()`. The signal is classified purely first: an
 * unrecognized, evidence-less, or below-threshold signal raises NOTHING and
 * returns null. When warranted, an immutable, neutral flag is written in `Raised`,
 * then a notification is enqueued and the flag advances to `Notified`.
 */
export async function raiseFlag(args: {
  householdId: string;
  /** Producing subsystem / service identity (for the audit trail). */
  actorUid: string;
  signal: ReviewSignal;
  /** Parent-defined rule promoting the resulting notification to Immediate. */
  parentUrgent?: boolean;
}): Promise<ReviewFlag | null> {
  const decision = classifySignal(args.signal);
  if (!decision.raise || decision.summary === null) {
    // Nothing warranted: no flag, no notification, no student-facing effect.
    return null;
  }

  // The flag is student-scoped metadata derived from learning activity; gate on
  // Active consent as every other collecting write does (invariant 6).
  await assertCollectionAllowed(args.householdId, args.signal.studentId);

  const ref = flagsCol(args.householdId).doc();
  const now = Date.now();
  const flag: ReviewFlag = {
    id: ref.id,
    studentId: args.signal.studentId,
    signalKind: args.signal.kind,
    state: 'Raised',
    evidence: args.signal.evidence,
    observedValue: args.signal.observedValue ?? null,
    threshold: args.signal.threshold ?? null,
    subjectRef: args.signal.subjectRef ?? null,
    summary: decision.summary,
    blocksLearning: false,
    resolution: null,
    resolvedByUid: null,
    resolutionNote: null,
    raisedAt: now,
    notifiedAt: null,
    reviewedAt: null,
    resolvedAt: null,
    updatedAt: now,
  };
  await ref.create(flag); // evidence is immutable once written

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.actorUid,
    action: 'write',
    recordType: 'review_flag',
    recordId: ref.id,
    studentId: args.signal.studentId,
    detail: `review flag raised signal=${args.signal.kind} (neutral, evidence-backed; ${decision.reason})`,
  });

  // Route the flag to a cadence tier and advance Raised → Notified.
  const event: NotificationEvent = {
    kind: 'review_flag',
    studentId: args.signal.studentId,
    sourceRef: ref.id,
    severity: 'routine',
    parentUrgent: args.parentUrgent,
    createdAt: now,
  };
  await enqueueNotification({
    householdId: args.householdId,
    actorUid: args.actorUid,
    event,
  });

  assertTransition('Raised', 'Notified');
  await ref.update({ state: 'Notified', notifiedAt: Date.now(), updatedAt: FieldValue.serverTimestamp() });

  return { ...flag, state: 'Notified', notifiedAt: now };
}

/**
 * Resolve a Review Flag (adult-only via `authorize`). Walks the flag through the
 * strict machine (Notified → Reviewed → Resolved) in one adult action, recording
 * the neutral outcome (dismissed / acknowledged / action-taken). Evidence is
 * never mutated — only the resolution bookkeeping is appended. A Student cannot
 * reach here: the capability matrix grants `write` on `review_flag` to adults only.
 */
export async function resolveFlag(args: {
  uid: string;
  householdId: string;
  flagId: string;
  outcome: ResolutionOutcome;
  note?: string;
}): Promise<ReviewFlag> {
  const membership = await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'review_flag',
    action: 'write',
  });

  if (!isResolutionOutcome(args.outcome)) {
    throw new ReviewError(`invalid resolution outcome: ${args.outcome}`);
  }

  return adminDb
    .runTransaction(async (tx) => {
      const ref = flagsCol(args.householdId).doc(args.flagId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new ReviewError('unknown review flag');
      const flag = snap.data() as ReviewFlag;

      // Instructor Reviewer scope is checked against the flag's Student.
      if (membership.role === 'instructor_reviewer') {
        const inScope = membership.scopeStudentIds?.includes(flag.studentId) ?? false;
        if (!inScope) throw new ReviewError('student is outside the reviewer scope');
      }

      if (flag.state !== 'Notified' && flag.state !== 'Reviewed') {
        throw new ReviewError(`flag is not open for resolution (state ${flag.state})`);
      }

      // Walk the strict machine: mark reviewed (if not already), then resolved.
      const now = Date.now();
      const reviewedAt = flag.reviewedAt ?? now;
      if (flag.state === 'Notified') assertTransition('Notified', 'Reviewed');
      assertTransition('Reviewed', 'Resolved');

      const resolved: ReviewFlag = {
        ...flag,
        state: 'Resolved',
        resolution: args.outcome,
        resolvedByUid: args.uid,
        resolutionNote: args.note ?? null,
        reviewedAt,
        resolvedAt: now,
        updatedAt: now,
      };
      tx.update(ref, {
        state: 'Resolved',
        resolution: args.outcome,
        resolvedByUid: args.uid,
        resolutionNote: args.note ?? null,
        reviewedAt,
        resolvedAt: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return resolved;
    })
    .then(async (resolved) => {
      await recordAudit({
        householdId: args.householdId,
        actorUid: args.uid,
        action: 'write',
        recordType: 'review_flag',
        recordId: args.flagId,
        studentId: resolved.studentId,
        detail: `review flag resolved outcome=${resolved.resolution}`,
      });
      return resolved;
    });
}

/**
 * Read-only rollup of a household's queued notifications for one cadence tier
 * (the Daily queue or Weekly digest). Adult-read via `authorize`; aggregation is
 * the pure `aggregateForTier`. No writes, no delivery side effects.
 */
export async function summarizeQueue(args: {
  uid: string;
  householdId: string;
  tier: DigestBucket['tier'];
}): Promise<DigestBucket> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'notification',
    action: 'read',
  });

  const snap = await notificationsCol(args.householdId).where('tier', '==', args.tier).get();
  const notifications = snap.docs.map((d) => d.data() as Notification);
  return aggregateForTier(notifications, args.tier);
}
