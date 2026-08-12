// Module B — parent approval / correction / rejection of an extracted draft.
// The parent gate between an advisory ExtractedDraft and a real Course
// (invariant 4). Materializes a Course (module C boundary) on approval.

import { adminDb, FieldValue } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { recordAudit } from '../audit/audit';
import { assertTransition } from './state-machine';
import { isBatchApprovable } from './approval-policy';
import { IngestionError } from './import';
import type { ExtractedDraft, ImportJob } from './types';

function importRef(householdId: string, importId: string) {
  return adminDb.doc(`households/${householdId}/imports/${importId}`);
}
function draftRef(householdId: string, importId: string) {
  return adminDb.doc(`households/${householdId}/imports/${importId}/draft/current`);
}

export async function approveImport(args: {
  uid: string;
  householdId: string;
  importId: string;
  /** True when part of a batch approval; requires batch-eligibility. */
  batch?: boolean;
}): Promise<string> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'course',
    action: 'approve',
  });

  const [jobSnap, draftSnap] = await Promise.all([
    importRef(args.householdId, args.importId).get(),
    draftRef(args.householdId, args.importId).get(),
  ]);
  if (!jobSnap.exists || !draftSnap.exists) throw new IngestionError('import or draft not found');
  const job = jobSnap.data() as ImportJob;
  const draft = draftSnap.data() as ExtractedDraft;

  assertTransition(job.state, 'Approved');

  if (args.batch && !isBatchApprovable(draft)) {
    throw new IngestionError('draft is not batch-eligible; individual review required');
  }

  // Materialize a Course (module C owns Courses going forward).
  const courseRef = adminDb.collection(`households/${args.householdId}/courses`).doc();
  await adminDb.runTransaction(async (tx) => {
    tx.set(courseRef, {
      id: courseRef.id,
      title: draft.courseTitle,
      sourceImportId: args.importId,
      lessons: draft.lessons,
      approvedBy: args.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(importRef(args.householdId, args.importId), {
      state: 'Approved',
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'approve',
    recordType: 'course',
    recordId: courseRef.id,
    detail: `approved import ${args.importId}${args.batch ? ' (batch)' : ''}`,
  });
  return courseRef.id;
}

export async function requestCorrection(args: {
  uid: string;
  householdId: string;
  importId: string;
}): Promise<void> {
  await authorize({ uid: args.uid, householdId: args.householdId, record: 'import', action: 'write' });
  await adminDb.runTransaction(async (tx) => {
    const ref = importRef(args.householdId, args.importId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new IngestionError('unknown import');
    assertTransition(snap.get('state'), 'NeedsCorrection');
    tx.update(ref, { state: 'NeedsCorrection', updatedAt: FieldValue.serverTimestamp() });
  });
}

export async function rejectImport(args: {
  uid: string;
  householdId: string;
  importId: string;
}): Promise<void> {
  await authorize({ uid: args.uid, householdId: args.householdId, record: 'import', action: 'write' });
  await adminDb.runTransaction(async (tx) => {
    const ref = importRef(args.householdId, args.importId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new IngestionError('unknown import');
    assertTransition(snap.get('state'), 'Rejected');
    tx.update(ref, { state: 'Rejected', updatedAt: FieldValue.serverTimestamp() });
  });
}
