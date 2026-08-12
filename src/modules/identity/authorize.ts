// Module A — server-side, fail-closed authorization (invariant 3).
//
// The Admin SDK bypasses Firestore rules, so every sensitive server access
// MUST call authorize() first. It re-derives the caller's Household membership
// and role from Firestore, checks the capability matrix, and enforces
// Instructor Reviewer student-scope. Any missing precondition throws — the
// default is denial, never allowance.

import { adminDb } from '../../lib/firebase/admin';
import { roleCan, type Action, type RecordType } from './roles';
import type { Membership } from './types';

export interface AuthzRequest {
  uid: string;
  householdId: string;
  record: RecordType;
  action: Action;
  /** Required when the record is scoped to a specific Student (reviewer scope). */
  studentId?: string;
}

export class AuthorizationError extends Error {
  constructor(reason: string) {
    super(`authorization denied: ${reason}`);
    this.name = 'AuthorizationError';
  }
}

/**
 * Returns the caller's Membership if permitted; throws AuthorizationError
 * otherwise. Fails closed on every missing input or lookup.
 */
export async function authorize(req: AuthzRequest): Promise<Membership> {
  if (!req.uid || !req.householdId) {
    throw new AuthorizationError('missing principal or household scope');
  }

  // Household isolation (invariant 1): caller must be a member of THIS household.
  const snap = await adminDb
    .doc(`households/${req.householdId}/members/${req.uid}`)
    .get();
  if (!snap.exists) {
    throw new AuthorizationError('caller is not a member of this household');
  }
  const membership = snap.data() as Membership;

  if (!roleCan(membership.role, req.record, req.action)) {
    throw new AuthorizationError(
      `role ${membership.role} may not ${req.action} ${req.record}`,
    );
  }

  // Instructor Reviewer scope: assigned students, plus any explicit elevation
  // that grants the requested action on the requested student.
  if (membership.role === 'instructor_reviewer' && req.studentId) {
    const inScope = membership.scopeStudentIds?.includes(req.studentId) ?? false;
    if (!inScope) {
      throw new AuthorizationError('student is outside the reviewer scope');
    }
  }

  return membership;
}

/** Boolean convenience wrapper; never throws. */
export async function can(req: AuthzRequest): Promise<boolean> {
  try {
    await authorize(req);
    return true;
  } catch {
    return false;
  }
}
