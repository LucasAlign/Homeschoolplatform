// Module F — mastery & adaptation operations (server-only, Admin SDK).
//
// Advisory observations become canonical only through a Parent Admin / Household
// Owner confirmation (the `approve` action; invariant 4). Confirmations are
// immutable and chained by supersession (invariant 5). Adaptation drafts are
// multi-signal-gated and reach Planning (module C) ONLY via a parent approval —
// this module never auto-inserts anything into a plan.

import { adminDb, FieldValue } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { assertCollectionAllowed } from '../consent/consent';
import { recordAudit } from '../audit/audit';
import { assertTransition, isCanonicalLevel } from './mastery-transitions';
import { canDraftAdaptation } from './remediation-gating';
import type {
  AdaptationKind,
  AdaptationSignal,
  AdaptationThresholds,
  MasteryLevel,
  MasteryRecord,
  RemediationDraft,
} from './types';

export class MasteryError extends Error {
  constructor(reason: string) {
    super(`mastery: ${reason}`);
    this.name = 'MasteryError';
  }
}

function masteryCol(hid: string) {
  return adminDb.collection(`households/${hid}/masteryRecords`);
}
function draftsCol(hid: string) {
  return adminDb.collection(`households/${hid}/remediationDrafts`);
}

/** The current (non-superseded) Confirmed record for a Student+skill, if any. */
async function currentConfirmed(
  hid: string,
  studentId: string,
  skillId: string,
): Promise<MasteryRecord | null> {
  const snap = await masteryCol(hid)
    .where('studentId', '==', studentId)
    .where('skillId', '==', skillId)
    .where('state', '==', 'Confirmed')
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0].data() as MasteryRecord);
}

/**
 * Record an ADVISORY Mastery observation (Observed). Evidence-backed and
 * confidence-tagged; never a canonical level until a parent confirms it.
 */
export async function observeMastery(args: {
  uid: string;
  householdId: string;
  studentId: string;
  skillId: string;
  level: MasteryLevel;
  evidenceBasis: string[];
  confidence: number;
}): Promise<MasteryRecord> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'mastery_record',
    action: 'write',
    studentId: args.studentId,
  });
  await assertCollectionAllowed(args.householdId, args.studentId);
  if (!isCanonicalLevel(args.level)) throw new MasteryError('non-canonical level');

  const ref = masteryCol(args.householdId).doc();
  const now = Date.now();
  const record: MasteryRecord = {
    id: ref.id,
    studentId: args.studentId,
    skillId: args.skillId,
    state: 'Observed',
    level: args.level,
    evidenceBasis: args.evidenceBasis,
    confidence: args.confidence,
    confirmedByUid: null,
    supersedesRecordId: null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.create(record);

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'write',
    recordType: 'mastery_record',
    recordId: ref.id,
    studentId: args.studentId,
    detail: `observed mastery skill=${args.skillId} level=${args.level} (advisory)`,
  });
  return record;
}

/**
 * Confirm a canonical Mastery level (Parent Admin / Household Owner only). Creates
 * a NEW immutable Confirmed record superseding the prior confirmation, and marks
 * the source observation and the prior confirmation Superseded (state-only
 * bookkeeping; the confirmed facts are never mutated). The parent may confirm a
 * level different from the observation — theirs is the record-of-truth.
 */
export async function confirmMastery(args: {
  uid: string;
  householdId: string;
  observedRecordId: string;
  /** Parent's canonical level; defaults to the observed level. */
  level?: MasteryLevel;
}): Promise<MasteryRecord> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'mastery_record',
    action: 'approve',
  });

  return adminDb.runTransaction(async (tx) => {
    const obsRef = masteryCol(args.householdId).doc(args.observedRecordId);
    const obsSnap = await tx.get(obsRef);
    if (!obsSnap.exists) throw new MasteryError('unknown observation');
    const observed = obsSnap.data() as MasteryRecord;
    if (observed.state !== 'Observed') throw new MasteryError('record is not Observed');

    const level = args.level ?? observed.level;
    if (!isCanonicalLevel(level)) throw new MasteryError('non-canonical level');

    const prior = await currentConfirmed(args.householdId, observed.studentId, observed.skillId);

    // The source observation is now confirmed; advance it out of the queue.
    assertTransition(observed.state, 'Superseded');
    tx.update(obsRef, { state: 'Superseded', updatedAt: FieldValue.serverTimestamp() });

    // Chain the prior confirmation into supersession (state-only advance).
    if (prior) {
      assertTransition(prior.state, 'Superseded');
      tx.update(masteryCol(args.householdId).doc(prior.id), {
        state: 'Superseded',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const ref = masteryCol(args.householdId).doc();
    const now = Date.now();
    const confirmed: MasteryRecord = {
      id: ref.id,
      studentId: observed.studentId,
      skillId: observed.skillId,
      state: 'Confirmed',
      level,
      evidenceBasis: observed.evidenceBasis,
      confidence: observed.confidence,
      confirmedByUid: args.uid,
      supersedesRecordId: prior?.id ?? null,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(ref, confirmed);
    return confirmed;
  }).then(async (confirmed) => {
    await recordAudit({
      householdId: args.householdId,
      actorUid: args.uid,
      action: 'approve',
      recordType: 'mastery_record',
      recordId: confirmed.id,
      studentId: confirmed.studentId,
      detail:
        `confirmed mastery skill=${confirmed.skillId} level=${confirmed.level}` +
        `${confirmed.supersedesRecordId ? ` supersedes=${confirmed.supersedesRecordId}` : ''}`,
    });
    return confirmed;
  });
}

/**
 * Draft a remediation/enrichment adaptation IF the multi-signal gate is met.
 * The draft is advisory — it is NOT inserted into any plan and is not student-
 * visible. Reaching Planning (module C) requires `approveAdaptationForPlanning`.
 */
export async function draftAdaptation(args: {
  uid: string;
  householdId: string;
  studentId: string;
  skillId: string;
  kind: AdaptationKind;
  signals: AdaptationSignal[];
  thresholds: AdaptationThresholds;
}): Promise<RemediationDraft> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'remediation_draft',
    action: 'write',
    studentId: args.studentId,
  });
  await assertCollectionAllowed(args.householdId, args.studentId);

  const gate = canDraftAdaptation(args.signals, args.thresholds);
  if (!gate.ok) throw new MasteryError(`adaptation not gated: ${gate.reason}`);

  const ref = draftsCol(args.householdId).doc();
  const draft: RemediationDraft = {
    id: ref.id,
    studentId: args.studentId,
    skillId: args.skillId,
    kind: args.kind,
    basis: gate.qualifying.map((_, i) => `${args.kind}-signal-${i}`),
    approvedByUid: null,
    createdAt: Date.now(),
  };
  await ref.create(draft);

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'write',
    recordType: 'remediation_draft',
    recordId: ref.id,
    studentId: args.studentId,
    detail: `drafted ${args.kind} skill=${args.skillId} (advisory; ${gate.reason})`,
  });
  return draft;
}

/**
 * Parent approves an adaptation draft toward Planning (Parent Admin+). This is
 * the parent gate (invariant 4): it records the approval so module C may adopt
 * the draft. It does NOT itself mutate a plan — insertion is a Planning
 * operation the parent performs separately.
 */
export async function approveAdaptationForPlanning(args: {
  uid: string;
  householdId: string;
  draftId: string;
}): Promise<RemediationDraft> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'remediation_draft',
    action: 'approve',
  });

  const ref = draftsCol(args.householdId).doc(args.draftId);
  const snap = await ref.get();
  if (!snap.exists) throw new MasteryError('unknown draft');
  const draft = snap.data() as RemediationDraft;
  if (draft.approvedByUid) throw new MasteryError('draft already approved');

  await ref.update({ approvedByUid: args.uid, approvedAt: FieldValue.serverTimestamp() });

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'approve',
    recordType: 'remediation_draft',
    recordId: args.draftId,
    studentId: draft.studentId,
    detail: `approved ${draft.kind} draft toward planning skill=${draft.skillId}`,
  });
  return { ...draft, approvedByUid: args.uid };
}
