// Module A — the canonical (role × record × action) capability matrix.
// Authorization is evaluated server-side and fails closed (invariant 3).
// This is the single source of truth both the server (authorize.ts) and the
// Firestore rules are kept consistent with.
//
// Actions: 'read' | 'write' | 'approve'. `approve` is the parent-authority
// action that turns an advisory draft into record-of-truth (invariant 4).

import type { Role } from './types';

export type Action = 'read' | 'write' | 'approve';

/**
 * Record types the matrix governs. Extended as later-phase modules land;
 * Phase 0 covers the foundation records.
 */
export type RecordType =
  | 'household'
  | 'membership'
  | 'student'
  | 'consent'
  | 'audit'
  | 'answer_key'
  | 'import'
  | 'course';

type Matrix = Record<RecordType, Partial<Record<Role, Action[]>>>;

// Household-Owner-exclusive concerns (billing, consent, roles, lifecycle,
// year-completion) never appear under parent_admin. Instructor Reviewers are
// advisory within scope; Students get own-scope access only.
export const CAPABILITY_MATRIX: Matrix = {
  household: {
    household_owner: ['read', 'write'],
    parent_admin: ['read'],
    instructor_reviewer: ['read'],
    student: ['read'],
  },
  membership: {
    household_owner: ['read', 'write'],
    parent_admin: ['read'],
    instructor_reviewer: ['read'],
    student: ['read'],
  },
  student: {
    household_owner: ['read', 'write'],
    parent_admin: ['read', 'write'],
    instructor_reviewer: ['read'], // scope-checked separately
  },
  consent: {
    household_owner: ['read', 'write', 'approve'],
  },
  audit: {
    household_owner: ['read'],
  },
  // Answer keys / teacher guides: no role has client access. Adult access is a
  // separate, audited server path only (invariant 2).
  answer_key: {},
  // Curriculum imports: parent+ create/manage; adults may read progress.
  import: {
    household_owner: ['read', 'write', 'approve'],
    parent_admin: ['read', 'write', 'approve'],
    instructor_reviewer: ['read'],
  },
  // Courses: parent+ author and approve; reviewers/students read (scope-checked).
  course: {
    household_owner: ['read', 'write', 'approve'],
    parent_admin: ['read', 'write', 'approve'],
    instructor_reviewer: ['read'],
    student: ['read'],
  },
};

export function roleCan(role: Role, record: RecordType, action: Action): boolean {
  return CAPABILITY_MATRIX[record]?.[role]?.includes(action) ?? false;
}
