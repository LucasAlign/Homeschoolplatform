// Server data-access for the parent curriculum-approval queue (module B).
//
// Reads run through the Admin SDK (which bypasses Firestore rules), so every
// read here first calls `authorize()` — the same fail-closed gate the write
// path uses (invariant 3). The client only ever supplies a reference (an import
// id); ownership and household scope are derived from the session, never trusted
// from the request (per the Next "Security" guidance: send a reference, re-read
// the rest from a trusted source).

import { adminDb } from '../../lib/firebase/admin';
import { authorize } from '../../modules/identity/authorize';
import { isBatchApprovable } from '../../modules/ingestion/approval-policy';
import type { ExtractedDraft, ImportJob } from '../../modules/ingestion/types';
import { requireSession } from '../../lib/auth/session';

/** A queue row: the import awaiting approval plus its extracted draft. */
export interface PendingApproval {
  importId: string;
  courseTitle: string;
  materialRole: ImportJob['materialRole'];
  overallConfidence: number;
  internallyConsistent: boolean;
  qualityFlagCount: number;
  lessonCount: number;
  assignmentCount: number;
  batchEligible: boolean;
  createdAt: number;
}

/** Full detail for the review screen: the job header + the draft tree. */
export interface ApprovalDetail {
  importId: string;
  job: Pick<ImportJob, 'id' | 'materialRole' | 'state' | 'createdAt'>;
  draft: ExtractedDraft;
  batchEligible: boolean;
}

function importsCol(householdId: string) {
  return adminDb.collection(`households/${householdId}/imports`);
}
function draftRef(householdId: string, importId: string) {
  return adminDb.doc(`households/${householdId}/imports/${importId}/draft/current`);
}

function toRow(importId: string, job: ImportJob, draft: ExtractedDraft): PendingApproval {
  return {
    importId,
    courseTitle: draft.courseTitle,
    materialRole: job.materialRole,
    overallConfidence: draft.overallConfidence,
    internallyConsistent: draft.internallyConsistent,
    qualityFlagCount: draft.qualityFlags.length,
    lessonCount: draft.lessons.length,
    assignmentCount: draft.lessons.reduce((n, l) => n + l.assignments.length, 0),
    batchEligible: isBatchApprovable(draft),
    createdAt: job.createdAt,
  };
}

/**
 * Every import in `ExtractedDraft` (awaiting the parent gate), newest first.
 * Single-equality query on `state` → auto-indexed, no composite needed.
 */
export async function listPendingApprovals(): Promise<PendingApproval[]> {
  const { uid, householdId } = await requireSession();
  await authorize({ uid, householdId, record: 'import', action: 'read' });

  const snap = await importsCol(householdId)
    .where('state', '==', 'ExtractedDraft')
    .get();

  const rows: PendingApproval[] = [];
  for (const jobDoc of snap.docs) {
    const job = jobDoc.data() as ImportJob;
    const d = await draftRef(householdId, jobDoc.id).get();
    if (!d.exists) continue; // a draft that hasn't landed yet — skip until it does
    rows.push(toRow(jobDoc.id, job, d.data() as ExtractedDraft));
  }
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows;
}

/** Detail for one pending import, or `null` if it isn't awaiting approval. */
export async function getApprovalDetail(importId: string): Promise<ApprovalDetail | null> {
  const { uid, householdId } = await requireSession();
  await authorize({ uid, householdId, record: 'import', action: 'read' });

  const [jobSnap, draftSnap] = await Promise.all([
    importsCol(householdId).doc(importId).get(),
    draftRef(householdId, importId).get(),
  ]);
  if (!jobSnap.exists || !draftSnap.exists) return null;
  const job = jobSnap.data() as ImportJob;
  if (job.state !== 'ExtractedDraft') return null;
  const draft = draftSnap.data() as ExtractedDraft;

  return {
    importId,
    job: { id: job.id, materialRole: job.materialRole, state: job.state, createdAt: job.createdAt },
    draft,
    batchEligible: isBatchApprovable(draft),
  };
}
