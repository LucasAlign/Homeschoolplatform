// Module A — Identity & Access: canonical types.
// See docs/mvp-specification.md §2, §4, §13.

export const ROLES = [
  'household_owner',
  'parent_admin',
  'instructor_reviewer',
  'student',
] as const;

export type Role = (typeof ROLES)[number];

/** A person's membership in a Household. One doc per user per household. */
export interface Membership {
  uid: string;
  role: Role;
  /** Instructor Reviewer scope: assigned Student ids (empty for other roles). */
  scopeStudentIds: string[];
  /** Instructor Reviewer scope: assigned subjects (empty for other roles). */
  scopeSubjects: string[];
  /**
   * Explicit, audited per-scope elevations the Household Owner may grant an
   * Instructor Reviewer (issue #12), e.g. { gradeFinalize: ['algebra-1'] }.
   */
  elevations: Record<string, string[]>;
  createdAt: number;
}

export interface Household {
  id: string;
  ownerUid: string;
  displayName: string;
  createdAt: number;
}

/**
 * A Student. `consentState` mirrors the module K consent gate and is
 * server-managed only (client-immutable per firestore.rules).
 */
export interface Student {
  id: string;
  displayName: string;
  gradeBand: '1-3' | '4-8' | '9-12';
  consentState: import('../consent/types').ConsentState;
  createdAt: number;
}
