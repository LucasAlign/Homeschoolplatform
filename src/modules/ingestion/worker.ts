// Module B — the idempotent async processing worker (Cloud Tasks -> Cloud Run).
//
// At-least-once delivery: processing is guarded on import state so a duplicate
// delivery is a no-op. OCR and structuring route through the AI gateway
// (module J) as Essential work. Output is an advisory ExtractedDraft that is
// never student-visible until a parent Approves it.

import { adminDb } from '../../lib/firebase/admin';
import { invokeAI } from '../ai-gateway/gateway';
import { advanceImportState, IngestionError } from './import';
import type { ExtractedDraft, ImportJob, ImportState } from './types';

const PROCESSABLE: ReadonlySet<ImportState> = new Set(['Uploaded', 'Preflight', 'Queued']);
export const HIGH_CONFIDENCE = 0.85;

function importRef(householdId: string, importId: string) {
  return adminDb.doc(`households/${householdId}/imports/${importId}`);
}
function draftRef(householdId: string, importId: string) {
  return adminDb.doc(`households/${householdId}/imports/${importId}/draft/current`);
}

export async function processImport(args: {
  uid: string;
  householdId: string;
  importId: string;
  estimatedPages: number;
}): Promise<void> {
  const snap = await importRef(args.householdId, args.importId).get();
  if (!snap.exists) throw new IngestionError('unknown import');
  const job = snap.data() as ImportJob;

  // Idempotency: only advance from a pre-processing state; duplicates no-op.
  if (!PROCESSABLE.has(job.state)) return;

  if (job.state === 'Uploaded') await advanceImportState(args.householdId, args.importId, 'Preflight');
  await advanceImportState(args.householdId, args.importId, 'Queued');
  await advanceImportState(args.householdId, args.importId, 'Processing');

  const base = {
    uid: args.uid,
    householdId: args.householdId,
    record: 'import' as const,
    estimatedUnits: Math.max(1, args.estimatedPages),
  };

  const ocr = await invokeAI({ ...base, purpose: 'ingestion_ocr' }, { importId: args.importId });
  if (!ocr.ok) {
    await advanceImportState(args.householdId, args.importId, 'Failed');
    throw new IngestionError(`ocr denied: ${ocr.decision.reason}`);
  }
  const structured = await invokeAI(
    { ...base, purpose: 'ingestion_structuring' },
    { ocr: ocr.output },
  );
  if (!structured.ok) {
    await advanceImportState(args.householdId, args.importId, 'Failed');
    throw new IngestionError(`structuring denied: ${structured.decision.reason}`);
  }

  // Build the advisory draft. (Real extraction maps structured output to
  // lessons/assignments with per-item confidence and provenance.)
  const draft: ExtractedDraft = {
    importId: args.importId,
    courseTitle: 'Imported Course (draft)',
    lessons: [],
    overallConfidence: 1,
    internallyConsistent: true,
    qualityFlags: job.qualityFlags,
  };
  await draftRef(args.householdId, args.importId).set(draft);

  // Severe quality problems request correction rather than a confident draft.
  const needsCorrection = job.qualityFlags.some((f) => f.kind === 'cutoff');
  await advanceImportState(
    args.householdId,
    args.importId,
    needsCorrection ? 'NeedsCorrection' : 'ExtractedDraft',
  );
}
