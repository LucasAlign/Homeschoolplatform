// Module B — import creation and state advancement (server-only, Admin SDK).
//
// A client performs a resumable private upload; the server then records the
// ImportJob (already Uploaded), tagging material role and isolating adult-only
// material. Rights attestation is required. State advances only along the
// canonical machine.

import { adminDb, FieldValue } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { recordAudit } from '../audit/audit';
import { assertTransition } from './state-machine';
import { isAdultOnly, type ImportJob, type ImportState, type MaterialRole } from './types';

export class IngestionError extends Error {
  constructor(reason: string) {
    super(`ingestion: ${reason}`);
    this.name = 'IngestionError';
  }
}

function importRef(householdId: string, importId: string) {
  return adminDb.doc(`households/${householdId}/imports/${importId}`);
}

export async function createImport(args: {
  uid: string;
  householdId: string;
  curriculumSourceId: string;
  materialRole: MaterialRole;
  rightsAttested: boolean;
  originalHash: string;
  idempotencyKey: string;
}): Promise<ImportJob> {
  await authorize({ uid: args.uid, householdId: args.householdId, record: 'import', action: 'write' });

  if (!args.rightsAttested) {
    throw new IngestionError('rights attestation required before import');
  }

  const ref = importRef(args.householdId, adminDb.collection('_').doc().id);
  const now = Date.now();
  const job: ImportJob = {
    id: ref.id,
    householdId: args.householdId,
    curriculumSourceId: args.curriculumSourceId,
    uploaderUid: args.uid,
    materialRole: args.materialRole,
    // Adult-only material is filed isolated and is NOT queued for
    // student-facing extraction (invariant 2); it lands terminal-Approved as a
    // stored reference. Student/mixed material proceeds to Preflight.
    state: isAdultOnly(args.materialRole) ? 'Approved' : 'Uploaded',
    rightsAttested: true,
    originalHash: args.originalHash,
    idempotencyKey: args.idempotencyKey,
    qualityFlags: [],
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(job);

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'write',
    recordType: 'import',
    recordId: ref.id,
    detail: `created import role=${args.materialRole} state=${job.state}`,
  });
  return job;
}

/** Advance an import along the canonical state machine, transactionally. */
export async function advanceImportState(
  householdId: string,
  importId: string,
  to: ImportState,
): Promise<void> {
  await adminDb.runTransaction(async (tx) => {
    const ref = importRef(householdId, importId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new IngestionError('unknown import');
    const from = snap.get('state') as ImportState;
    assertTransition(from, to);
    tx.update(ref, { state: to, updatedAt: FieldValue.serverTimestamp() });
  });
}
