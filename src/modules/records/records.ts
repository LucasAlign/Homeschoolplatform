// Module H — Records & Portfolio operations (server-only, Admin SDK).
//
// School Years and Portfolio Snapshots are server-written; clients never write
// them (Firestore rules deny it, and the server is the single writer). Three
// authorities are enforced here, all fail-closed via authorize():
//   - School-Year completion is HOUSEHOLD-OWNER-only (§13, Owner-only lifecycle).
//   - Snapshot approval (freezing the immutable copy) is Household-Owner-only.
//   - Snapshot reopen (supersession) is Household-Owner-only and always logged.
// Completion evaluates the preconditions purely (completion.ts), freezes the
// year's final Plan Revision + Official Grades, and assembles a Draft snapshot
// through the answer-key exclusion filter (snapshot.ts). Every write is audited.

import { adminDb, FieldValue } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { recordAudit } from '../audit/audit';
import { evaluateCompletionPreconditions } from './completion';
import {
  assertSnapshotTransition,
  assertYearTransition,
} from './school-year-state-machine';
import {
  assembleSnapshotContent,
  assertNoAnswerKeyLeakage,
  nextSnapshotChain,
} from './snapshot';
import type {
  CompletionInput,
  PortfolioSnapshot,
  PriorSnapshotRef,
  SchoolYear,
  SnapshotSourceItem,
} from './types';

export class RecordsError extends Error {
  constructor(reason: string) {
    super(`records: ${reason}`);
    this.name = 'RecordsError';
  }
}

function yearRef(hid: string, yearId: string) {
  return adminDb.doc(`households/${hid}/schoolYears/${yearId}`);
}
function snapshotsCol(hid: string) {
  return adminDb.collection(`households/${hid}/portfolioSnapshots`);
}

/**
 * Complete (or withdraw) a School Year — HOUSEHOLD-OWNER-only. Evaluates the
 * completion preconditions purely; a blocked completion throws unless the Owner
 * acknowledged the incompletes. On success it advances the year to its terminal
 * outcome, freezes the final Plan Revision, and writes a DRAFT Portfolio Snapshot
 * assembled through the exclusion filter. The Draft is not yet the record — the
 * Owner approves it separately (approveSnapshot).
 */
export async function completeSchoolYear(args: {
  uid: string;
  householdId: string;
  schoolYearId: string;
  input: CompletionInput;
  /** The year's final immutable Plan Revision to freeze (if the student had one). */
  finalPlanRevisionId?: string | null;
  /** Candidate items for the snapshot; filtered by assembleSnapshotContent. */
  snapshotItems: SnapshotSourceItem[];
}): Promise<{ year: SchoolYear; snapshot: PortfolioSnapshot }> {
  // Owner-only lifecycle authority (invariant 3, fail-closed).
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'school_year',
    action: 'approve',
    studentId: undefined,
  });

  const evaluation = evaluateCompletionPreconditions(args.input);
  if (!evaluation.allowed) {
    throw new RecordsError(
      `completion blocked: ${evaluation.blockers.join('; ')} (acknowledge incompletes to record a Partial year)`,
    );
  }

  return adminDb.runTransaction(async (tx) => {
    const ySnap = await tx.get(yearRef(args.householdId, args.schoolYearId));
    if (!ySnap.exists) throw new RecordsError('unknown school year');
    const year = ySnap.data() as SchoolYear;
    if (year.state !== 'Active') {
      throw new RecordsError(`school year is not Active (state ${year.state})`);
    }

    // Legal transition Active → outcome (Completed | Partial | Withdrawn).
    assertYearTransition('Active', evaluation.outcome);

    // Assemble + freeze the self-contained Draft snapshot through the exclusion
    // filter, then defensively assert no answer-key material survived.
    const assembly = assembleSnapshotContent(args.snapshotItems, year.studentId);
    assertNoAnswerKeyLeakage(assembly.included);

    const snapRef = snapshotsCol(args.householdId).doc();
    const now = Date.now();
    const snapshot: PortfolioSnapshot = {
      id: snapRef.id,
      studentId: year.studentId,
      schoolYearId: args.schoolYearId,
      state: 'Draft',
      outcome: evaluation.outcome,
      version: 1,
      supersedesSnapshotId: null,
      content: assembly.included,
      excluded: assembly.excluded,
      approvedByUid: null,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(snapRef, snapshot);

    const updatedYear: SchoolYear = {
      ...year,
      state: evaluation.outcome,
      frozenPlanRevisionId: args.finalPlanRevisionId ?? year.frozenPlanRevisionId ?? null,
      snapshotId: snapRef.id,
      incompleteAcknowledged: evaluation.incompleteAcknowledged,
      completedByUid: args.uid,
      updatedAt: now,
    };
    tx.update(yearRef(args.householdId, args.schoolYearId), {
      state: updatedYear.state,
      frozenPlanRevisionId: updatedYear.frozenPlanRevisionId,
      snapshotId: updatedYear.snapshotId,
      incompleteAcknowledged: updatedYear.incompleteAcknowledged,
      completedByUid: updatedYear.completedByUid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { year: updatedYear, snapshot };
  }).then(async (result) => {
    await recordAudit({
      householdId: args.householdId,
      actorUid: args.uid,
      action: 'approve',
      recordType: 'school_year',
      recordId: args.schoolYearId,
      studentId: result.year.studentId,
      detail: `year ${evaluation.outcome} (acknowledged=${evaluation.incompleteAcknowledged}); draft snapshot ${result.snapshot.id} excluded=${result.snapshot.excluded.length}`,
    });
    return result;
  });
}

/**
 * Approve a Draft snapshot into the immutable, self-contained Approved copy —
 * HOUSEHOLD-OWNER-only. A no-op if already Approved fails the strict transition.
 * The content is not mutated; only the state + approver are recorded.
 */
export async function approveSnapshot(args: {
  uid: string;
  householdId: string;
  snapshotId: string;
}): Promise<PortfolioSnapshot> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'portfolio_snapshot',
    action: 'approve',
  });

  return adminDb.runTransaction(async (tx) => {
    const ref = snapshotsCol(args.householdId).doc(args.snapshotId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new RecordsError('unknown snapshot');
    const snapshot = snap.data() as PortfolioSnapshot;

    assertSnapshotTransition(snapshot.state, 'Approved');
    // Defence-in-depth: the immutable copy must be answer-key-free (invariant 2).
    assertNoAnswerKeyLeakage(snapshot.content);

    const now = Date.now();
    tx.update(ref, {
      state: 'Approved',
      approvedByUid: args.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...snapshot, state: 'Approved' as const, approvedByUid: args.uid, updatedAt: now };
  }).then(async (approved) => {
    await recordAudit({
      householdId: args.householdId,
      actorUid: args.uid,
      action: 'approve',
      recordType: 'portfolio_snapshot',
      recordId: approved.id,
      studentId: approved.studentId,
      detail: `snapshot approved (immutable) v${approved.version}`,
    });
    return approved;
  });
}

/**
 * Reopen an Approved snapshot — HOUSEHOLD-OWNER-only and always logged. The
 * Approved copy is NEVER mutated (invariant 5): it transitions to Superseded and
 * a NEW Draft is materialized that supersedes it (nextSnapshotChain), re-assembled
 * through the exclusion filter from the caller-supplied corrected items.
 */
export async function reopenSnapshot(args: {
  uid: string;
  householdId: string;
  snapshotId: string;
  /** Corrected candidate items for the superseding draft. */
  snapshotItems: SnapshotSourceItem[];
  reason: string;
}): Promise<{ superseded: PortfolioSnapshot; draft: PortfolioSnapshot }> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'portfolio_snapshot',
    action: 'approve',
  });

  return adminDb.runTransaction(async (tx) => {
    const priorRef = snapshotsCol(args.householdId).doc(args.snapshotId);
    const priorSnap = await tx.get(priorRef);
    if (!priorSnap.exists) throw new RecordsError('unknown snapshot');
    const prior = priorSnap.data() as PortfolioSnapshot;

    // Only an Approved copy is reopened; a Draft is edited in place before
    // approval, and a Superseded copy is already terminal.
    assertSnapshotTransition(prior.state, 'Superseded');

    const chainRef: PriorSnapshotRef = { id: prior.id, version: prior.version };
    const chain = nextSnapshotChain(chainRef);

    const assembly = assembleSnapshotContent(args.snapshotItems, prior.studentId);
    assertNoAnswerKeyLeakage(assembly.included);

    const draftRef = snapshotsCol(args.householdId).doc();
    const now = Date.now();
    const draft: PortfolioSnapshot = {
      id: draftRef.id,
      studentId: prior.studentId,
      schoolYearId: prior.schoolYearId,
      state: 'Draft',
      outcome: prior.outcome,
      version: chain.version,
      supersedesSnapshotId: chain.supersedesSnapshotId,
      content: assembly.included,
      excluded: assembly.excluded,
      approvedByUid: null,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(draftRef, draft);
    // Supersede the prior copy WITHOUT mutating its content (only state).
    tx.update(priorRef, { state: 'Superseded', updatedAt: FieldValue.serverTimestamp() });

    return {
      superseded: { ...prior, state: 'Superseded' as const, updatedAt: now },
      draft,
    };
  }).then(async (result) => {
    await recordAudit({
      householdId: args.householdId,
      actorUid: args.uid,
      action: 'write',
      recordType: 'portfolio_snapshot',
      recordId: result.superseded.id,
      studentId: result.superseded.studentId,
      detail: `snapshot reopened → superseded by ${result.draft.id} (v${result.draft.version}); reason: ${args.reason}`,
    });
    return result;
  });
}
