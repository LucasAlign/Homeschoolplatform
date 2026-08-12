// Module K — consent gate and transitions (server-only, Admin SDK).
//
// `assertCollectionAllowed` is the gate every collecting module (B, D, E, F)
// calls before writing child data (invariant 6). Transitions are forward-only,
// mirror the effective state onto the Student doc's client-immutable
// `consentState` field, and append an immutable receipt.

import { adminDb, FieldValue } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { recordAudit } from '../audit/audit';
import {
  canTransition,
  type ConsentPurpose,
  type ConsentReceipt,
  type ConsentState,
} from './types';

export class ConsentError extends Error {
  constructor(reason: string) {
    super(`consent gate: ${reason}`);
    this.name = 'ConsentError';
  }
}

function studentRef(householdId: string, studentId: string) {
  return adminDb.doc(`households/${householdId}/students/${studentId}`);
}

/**
 * Throws unless the Student's core-learning consent is Active. Callers writing
 * child data must await this first.
 */
export async function assertCollectionAllowed(
  householdId: string,
  studentId: string,
): Promise<void> {
  const snap = await studentRef(householdId, studentId).get();
  if (!snap.exists) throw new ConsentError('unknown student');
  if (snap.get('consentState') !== 'Active') {
    throw new ConsentError('collection not permitted (consent is not Active)');
  }
}

/**
 * Advances consent for a Student+purpose, forward-only. Household-Owner-only
 * (checked via authorize). Writes an immutable receipt and mirrors the
 * effective core-learning state onto the Student doc.
 */
export async function transitionConsent(args: {
  ownerUid: string;
  householdId: string;
  studentId: string;
  purpose: ConsentPurpose;
  to: ConsentState;
  noticeVersion: string;
  policyVersion: string;
  method: string;
}): Promise<ConsentReceipt> {
  await authorize({
    uid: args.ownerUid,
    householdId: args.householdId,
    record: 'consent',
    action: 'approve',
    studentId: args.studentId,
  });

  const ref = studentRef(args.householdId, args.studentId);
  const snap = await ref.get();
  if (!snap.exists) throw new ConsentError('unknown student');
  const from = (snap.get('consentState') as ConsentState) ?? 'NotRequested';

  if (!canTransition(from, args.to)) {
    throw new ConsentError(`illegal transition ${from} -> ${args.to}`);
  }

  const receiptRef = adminDb
    .collection(`households/${args.householdId}/consents`)
    .doc();
  const receipt: ConsentReceipt = {
    id: receiptRef.id,
    studentId: args.studentId,
    purpose: args.purpose,
    state: args.to,
    verifiedAdultUid: args.ownerUid,
    noticeVersion: args.noticeVersion,
    policyVersion: args.policyVersion,
    method: args.method,
    createdAt: Date.now(),
  };

  await adminDb.runTransaction(async (tx) => {
    tx.set(receiptRef, receipt);
    // Mirror only the core-learning purpose onto the collection gate.
    if (args.purpose === 'core_learning') {
      tx.update(ref, { consentState: args.to, updatedAt: FieldValue.serverTimestamp() });
    }
  });

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.ownerUid,
    action: 'approve',
    recordType: 'consent',
    recordId: receipt.id,
    studentId: args.studentId,
    detail: `consent ${args.purpose}: ${from} -> ${args.to}`,
  });

  return receipt;
}
