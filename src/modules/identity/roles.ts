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
  | 'course'
  | 'plan'
  | 'submission'
  | 'evidence'
  | 'support_event'
  | 'ai_assessment'
  | 'official_grade'
  | 'mastery_record'
  | 'remediation_draft'
  | 'review_flag'
  | 'notification'
  | 'school_year'
  | 'portfolio_snapshot'
  | 'deletion'
  | 'export';

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
  // Plans: parent+ propose and approve into immutable revisions; students read
  // their Approved Plan (bounded reorder/defer is handled by module C guards,
  // not by granting plan-write). Reviewers read within scope.
  plan: {
    household_owner: ['read', 'write', 'approve'],
    parent_admin: ['read', 'write', 'approve'],
    instructor_reviewer: ['read'],
    student: ['read'],
  },
  // Daily work (module D). Parents assign and review; a Student submits within
  // their OWN scope (write) but NEVER grades or approves — turning a Submission
  // into an Official Grade is module E's parent-approval gate (invariant 4).
  submission: {
    household_owner: ['read', 'write', 'approve'],
    parent_admin: ['read', 'write', 'approve'],
    instructor_reviewer: ['read'],
    student: ['read', 'write'], // own-scope submit only; no approve
  },
  // Evidence: Student attaches own proof-of-work (consent-gated server-side).
  evidence: {
    household_owner: ['read', 'write'],
    parent_admin: ['read', 'write'],
    instructor_reviewer: ['read'],
    student: ['read', 'write'], // own-scope
  },
  // Support Events: logged assistance. The tutor writes on the Student's behalf
  // (own-scope); adults read the assistance trail. No role approves them.
  support_event: {
    household_owner: ['read'],
    parent_admin: ['read'],
    instructor_reviewer: ['read'],
    student: ['read', 'write'], // own-scope tutoring turns
  },
  // AI Assessments (module E): advisory, server-written via the async worker.
  // Adults read the disclosure envelope; NO role writes via client and NO role
  // approves the assessment itself — approval happens against `official_grade`.
  // Students never see the raw advisory assessment (they see suggested-vs-final
  // on the Official Grade).
  ai_assessment: {
    household_owner: ['read'],
    parent_admin: ['read'],
    instructor_reviewer: ['read'],
  },
  // Official Grades (module E): the parent-approval gate turns an advisory
  // assessment into an immutable Official Grade. `approve` is the ONLY path to a
  // grade (invariant 4) and belongs to parents only — a Student NEVER grades or
  // approves. Students read their own grade to see suggested-vs-final (§8).
  official_grade: {
    household_owner: ['read', 'approve'],
    parent_admin: ['read', 'approve'],
    instructor_reviewer: ['read'],
    student: ['read'], // suggested-vs-final; no write, no approve
  },
  // Mastery Records (module F): advisory observations parents+ write; only a
  // Parent Admin / Household Owner `approve` (confirms) a canonical level.
  // Students read their own confirmed mastery; reviewers read within scope.
  mastery_record: {
    household_owner: ['read', 'write', 'approve'],
    parent_admin: ['read', 'write', 'approve'],
    instructor_reviewer: ['read'],
    student: ['read'],
  },
  // Remediation/enrichment drafts (module F): parents+ author; a parent `approve`
  // is required before a draft may reach Planning (invariant 4). Not student-
  // visible until it becomes plan content the parent adopted.
  remediation_draft: {
    household_owner: ['read', 'write', 'approve'],
    parent_admin: ['read', 'write', 'approve'],
    instructor_reviewer: ['read'],
  },
  // Review Flags (module G): neutral, evidence-backed requests for adult
  // attention. Server-raised from a signal; a flag NEVER blocks learning. Adults
  // read and RESOLVE them (`write` records the neutral outcome); a Student NEVER
  // resolves a flag and gets no access here. Instructor Reviewers resolve only
  // within their student scope (checked in review.ts), reflected as `write`.
  review_flag: {
    household_owner: ['read', 'write'],
    parent_admin: ['read', 'write'],
    instructor_reviewer: ['read', 'write'],
  },
  // Notifications (module G): server-written cadence records (Immediate / Daily /
  // Weekly). Adults read within scope; no role writes via client and none
  // approves — routing and delivery are server concerns.
  notification: {
    household_owner: ['read'],
    parent_admin: ['read'],
    instructor_reviewer: ['read'],
  },
  // School Years (module H): School-Year COMPLETION is Household-Owner-only
  // (§13, Owner-only lifecycle) — the Owner alone `approve`s the terminal
  // Completed/Partial/Withdrawn transition that freezes the record. Parent Admins
  // and reviewers read within scope; a Parent Admin has academic authority but
  // NOT lifecycle authority, so it never writes/approves a year.
  school_year: {
    household_owner: ['read', 'write', 'approve'],
    parent_admin: ['read'],
    instructor_reviewer: ['read'],
  },
  // Portfolio Snapshots (module H): immutable, parent-approved records. Approval
  // (freezing the immutable copy) and reopen (supersession) are Household-Owner-
  // only lifecycle acts. Adults read within scope; a Student reads their OWN
  // portfolio. No mutation — corrections supersede (invariant 5).
  portfolio_snapshot: {
    household_owner: ['read', 'write', 'approve'],
    parent_admin: ['read'],
    instructor_reviewer: ['read'],
    student: ['read'],
  },
  // Deletion (module K): cascading hard-delete requests are Household-Owner-only
  // (§13/§14). `approve` is the authorizing act; the content-free ledger is
  // owner-read.
  deletion: {
    household_owner: ['read', 'write', 'approve'],
  },
  // Export (module K): portable household-scoped export is Household-Owner-only
  // (§14). `approve` authorizes generating the export bundles.
  export: {
    household_owner: ['read', 'write', 'approve'],
  },
};

export function roleCan(role: Role, record: RecordType, action: Action): boolean {
  return CAPABILITY_MATRIX[record]?.[role]?.includes(action) ?? false;
}
