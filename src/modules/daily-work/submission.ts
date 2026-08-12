// Module D — submission operations (server-only, Admin SDK).
//
// Owns the Assigned → InProgress → Submitted portion of the daily loop. A parent
// assigns work; the Student starts it, attaches Evidence, and submits. On submit
// the Evidence Policy is validated and the Submission is enqueued for module E's
// async assessment — module D STOPS there (progression is never gated on grading).
//
// Every child-data write passes the consent gate first (invariant 6), authorizes
// fail-closed (invariant 3), and records an immutable audit event (invariant 9).

import { adminDb, FieldValue } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { assertCollectionAllowed } from '../consent/consent';
import { recordAudit } from '../audit/audit';
import { assertTransition } from './submission-state-machine';
import { evidenceSatisfies } from './evidence-policy';
import { UPLOAD_EVIDENCE_KINDS } from './types';
import type {
  Evidence,
  EvidenceKind,
  EvidencePolicy,
  Submission,
  SubmissionState,
} from './types';

export class DailyWorkError extends Error {
  constructor(reason: string) {
    super(`daily-work: ${reason}`);
    this.name = 'DailyWorkError';
  }
}

function submissionRef(hid: string, sid: string) {
  return adminDb.doc(`households/${hid}/submissions/${sid}`);
}
function evidenceCol(hid: string) {
  return adminDb.collection(`households/${hid}/evidence`);
}
function newId(): string {
  return adminDb.collection('_').doc().id;
}

/**
 * Parent assigns a unit of work, creating a Submission in `Assigned`. Resubmission
 * passes `supersedesSubmissionId`; the superseding assessment/grade is materialized
 * downstream in module E.
 */
export async function assignWork(args: {
  uid: string;
  householdId: string;
  assignmentId: string;
  studentId: string;
  supersedesSubmissionId?: string;
  attempt?: number;
}): Promise<Submission> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'submission',
    action: 'write',
    studentId: args.studentId,
  });

  const ref = submissionRef(args.householdId, newId());
  const now = Date.now();
  const submission: Submission = {
    id: ref.id,
    assignmentId: args.assignmentId,
    studentId: args.studentId,
    state: 'Assigned',
    attempt: args.attempt ?? 1,
    supersedesSubmissionId: args.supersedesSubmissionId ?? null,
    evidenceIds: [],
    submittedAt: null,
    assessmentEnqueuedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(submission);

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'write',
    recordType: 'submission',
    recordId: ref.id,
    studentId: args.studentId,
    detail: `assigned work assignment=${args.assignmentId} attempt=${submission.attempt}`,
  });
  return submission;
}

/** Advance a Submission along the module-D machine, transactionally. */
async function advanceState(
  hid: string,
  sid: string,
  to: SubmissionState,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await adminDb.runTransaction(async (tx) => {
    const ref = submissionRef(hid, sid);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DailyWorkError('unknown submission');
    const from = snap.get('state') as SubmissionState;
    assertTransition(from, to);
    tx.update(ref, { state: to, updatedAt: FieldValue.serverTimestamp(), ...extra });
  });
}

/** Student starts work: Assigned → InProgress (own-scope). */
export async function startWork(args: {
  uid: string;
  householdId: string;
  submissionId: string;
  studentId: string;
}): Promise<void> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'submission',
    action: 'write',
    studentId: args.studentId,
  });
  await advanceState(args.householdId, args.submissionId, 'InProgress');
}

/**
 * Attach a piece of Evidence to a Submission (child-data write → consent gate).
 * Upload kinds must carry a Storage path; `adult_verification` records the
 * verifying adult. The Evidence doc is server-written and append-only.
 */
export async function attachEvidence(args: {
  uid: string;
  householdId: string;
  submissionId: string;
  studentId: string;
  kind: EvidenceKind;
  storagePath?: string;
  integrationResultId?: string;
  verifiedByUid?: string;
}): Promise<Evidence> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'evidence',
    action: 'write',
    studentId: args.studentId,
  });
  // Consent gate: Evidence is child data (invariant 6).
  await assertCollectionAllowed(args.householdId, args.studentId);

  if (UPLOAD_EVIDENCE_KINDS.has(args.kind) && !args.storagePath) {
    throw new DailyWorkError(`evidence kind ${args.kind} requires a storage path`);
  }
  if (args.kind === 'adult_verification' && !args.verifiedByUid) {
    throw new DailyWorkError('adult_verification requires a verifying adult');
  }

  const ref = evidenceCol(args.householdId).doc();
  const evidence: Evidence = {
    id: ref.id,
    submissionId: args.submissionId,
    studentId: args.studentId,
    kind: args.kind,
    storagePath: args.storagePath,
    integrationResultId: args.integrationResultId,
    verifiedByUid: args.verifiedByUid,
    createdAt: Date.now(),
  };

  await adminDb.runTransaction(async (tx) => {
    const sRef = submissionRef(args.householdId, args.submissionId);
    const sSnap = await tx.get(sRef);
    if (!sSnap.exists) throw new DailyWorkError('unknown submission');
    if (sSnap.get('state') === 'Submitted') {
      throw new DailyWorkError('cannot attach evidence to a submitted attempt');
    }
    tx.set(ref, evidence);
    tx.update(sRef, {
      evidenceIds: FieldValue.arrayUnion(ref.id),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'write',
    recordType: 'evidence',
    recordId: ref.id,
    studentId: args.studentId,
    detail: `attached ${args.kind} evidence to submission=${args.submissionId}`,
  });
  return evidence;
}

/**
 * Student submits an attempt: validates the Evidence Policy, advances to
 * Submitted, and enqueues module E's async assessment. STOPS at the assessment
 * boundary — module D builds no assessment or grade.
 */
export async function submitWork(args: {
  uid: string;
  householdId: string;
  submissionId: string;
  studentId: string;
  evidencePolicy: EvidencePolicy;
}): Promise<{ submissionId: string; enqueued: true }> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'submission',
    action: 'write',
    studentId: args.studentId,
  });
  // Consent gate: submitting is a child-data write (invariant 6).
  await assertCollectionAllowed(args.householdId, args.studentId);

  // Load the attached Evidence and validate against the Assignment's policy.
  const evSnap = await evidenceCol(args.householdId)
    .where('submissionId', '==', args.submissionId)
    .get();
  const evidence = evSnap.docs.map((d) => d.data() as Evidence);
  const check = evidenceSatisfies(args.evidencePolicy, evidence);
  if (!check.ok) throw new DailyWorkError(check.reason ?? 'evidence policy not satisfied');

  const submittedAt = Date.now();
  // Advance and mark the assessment hand-off. In production the enqueue is a
  // Cloud Tasks dispatch to the idempotent module-E assessment worker; here we
  // record the intent so the boundary is explicit and auditable.
  await advanceState(args.householdId, args.submissionId, 'Submitted', {
    submittedAt,
    assessmentEnqueuedAt: submittedAt,
  });

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'write',
    recordType: 'submission',
    recordId: args.submissionId,
    studentId: args.studentId,
    detail: 'submitted; enqueued for async assessment (module E)',
  });
  return { submissionId: args.submissionId, enqueued: true };
}
