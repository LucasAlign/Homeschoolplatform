// Module H — Records & Portfolio: canonical types.
// See docs/mvp-specification.md §5 (School Year + Portfolio Snapshot state
// machine), §11 (Records & portfolio), §17 (invariants) and issue #8.
//
// School-Year completion is a HOUSEHOLD-OWNER act (§13, Owner-only lifecycle). It
// freezes an immutable, parent-approved, self-contained Portfolio Snapshot bound
// to exactly ONE Student + year. A Snapshot is immutable-via-supersession
// (invariant 5): a correction never mutates it — a logged Owner reopen supersedes
// it with a new Draft. Answer keys / teacher guides never appear in a snapshot
// (invariant 2), verbatim tutor transcripts are summarized only, and AI
// Assessments appear ONLY as advisory-labeled context, never as standalone grades.
// A Portfolio Snapshot is NOT an accredited transcript.

// --- School Year lifecycle (§5) ---
//
//   Active
//     → (Household-Owner completion, gated) → Completed | Partial | Withdrawn
// Completion is gated on every in-scope Assignment being terminal (graded /
// exempted / explicitly-acknowledged-incomplete), NO pending AI Assessment, and
// NO unresolved Review Flag — else blocked unless the Owner explicitly
// acknowledges + records the incompletes (which yields `Partial`). Terminal
// states are immutable outcomes of the reporting period.
export const SCHOOL_YEAR_STATES = ['Active', 'Completed', 'Partial', 'Withdrawn'] as const;
export type SchoolYearState = (typeof SCHOOL_YEAR_STATES)[number];

/** The three terminal completion outcomes (everything but `Active`). */
export const SCHOOL_YEAR_OUTCOMES = ['Completed', 'Partial', 'Withdrawn'] as const;
export type SchoolYearOutcome = (typeof SCHOOL_YEAR_OUTCOMES)[number];

/**
 * A School Year: the reporting period for one Student. Server-written; the
 * completion transition is Household-Owner-only and freezes the year's Official
 * Grades + final Plan Revision into a Portfolio Snapshot.
 */
export interface SchoolYear {
  id: string;
  studentId: string;
  /** Human label for the reporting period, e.g. "2025–2026". */
  label: string;
  state: SchoolYearState;
  /** The immutable Plan Revision frozen at completion (final revision), if any. */
  frozenPlanRevisionId: string | null;
  /** The Portfolio Snapshot the completion produced, once approved. */
  snapshotId: string | null;
  /** Recorded when the Owner acknowledged + recorded incompletes (Partial). */
  incompleteAcknowledged: boolean;
  /** The Owner who completed the year (invariant: Owner-only lifecycle). */
  completedByUid: string | null;
  createdAt: number;
  updatedAt: number;
}

// --- Assignment terminal status (completion precondition input) ---
//
// An Assignment is TERMINAL for completion when it is graded, exempted by an
// adult, or explicitly acknowledged-incomplete by the Owner. Anything else
// (assigned / in-progress / submitted-but-ungraded) is a completion blocker.
export const TERMINAL_ASSIGNMENT_STATUSES = [
  'graded',
  'exempted',
  'acknowledged_incomplete',
] as const;
export type TerminalAssignmentStatus = (typeof TERMINAL_ASSIGNMENT_STATUSES)[number];

export type AssignmentCompletionStatus =
  | TerminalAssignmentStatus
  | 'assigned'
  | 'in_progress'
  | 'submitted';

/** A content-free summary of one in-scope Assignment's completion status. */
export interface AssignmentCompletionSummary {
  assignmentId: string;
  status: AssignmentCompletionStatus;
}

/**
 * The inputs a completion-precondition evaluation needs — all content-free
 * counts and statuses gathered by the server, never record content.
 */
export interface CompletionInput {
  assignments: AssignmentCompletionSummary[];
  /** AI Assessments still `AIAssessing`/`AssessmentReady` (no Official Grade yet). */
  pendingAssessmentCount: number;
  /** Review Flags not yet `Resolved`. */
  unresolvedFlagCount: number;
  /** The Owner intends to withdraw rather than complete the year. */
  intent: 'complete' | 'withdraw';
  /**
   * The Owner explicitly acknowledges + records the incompletes. Turns an
   * otherwise-blocked completion into a recorded `Partial` (§11).
   */
  acknowledgeIncomplete: boolean;
}

/** The result of evaluating completion preconditions (pure). */
export interface CompletionEvaluation {
  /** Whether the completion may proceed. */
  allowed: boolean;
  /** Content-free reasons the year is not cleanly `Completed`. */
  blockers: string[];
  /** True when incompletes were acknowledged + recorded (a `Partial` year). */
  incompleteAcknowledged: boolean;
  /** The resulting terminal state if the completion proceeds. */
  outcome: SchoolYearOutcome;
}

// --- Portfolio Snapshot lifecycle (§5) ---
//
//   Draft → Approved (immutable, self-contained copy)
//              → Superseded (on a logged Household-Owner reopen; NEVER mutated)
// An Approved snapshot is un-editable but WHOLLY deletable on an authorized,
// export-first request (mutation ≠ existence — see module K's deletion rule).
export const SNAPSHOT_STATES = ['Draft', 'Approved', 'Superseded'] as const;
export type SnapshotState = (typeof SNAPSHOT_STATES)[number];

// --- Snapshot content classes (§11, invariant 2) ---
//
// What a snapshot may contain, and what is EXCLUDED by rule. The exclusion filter
// (snapshot.ts) is non-negotiable: answer keys / teacher guides never appear,
// verbatim tutor transcripts are summarized only, and an AI Assessment may appear
// ONLY as advisory-labeled context — never as a standalone grade.
export const SNAPSHOT_INCLUDED_CLASSES = [
  'course',
  'official_grade', // parent-approved only
  'evidence', // parent-selected only
  'photo', // parent-selected only
  'confirmed_mastery',
  'attendance', // optional
  'archive_appendix',
  'tutor_summary', // summarized assistance only, never verbatim
  'ai_assessment_context', // advisory-labeled context only
] as const;

export const SNAPSHOT_EXCLUDED_CLASSES = [
  'answer_key', // invariant 2 — never in a snapshot
  'teacher_guide', // invariant 2 — never in a snapshot
  'tutor_transcript_verbatim', // summarized only (use `tutor_summary`)
  'ai_assessment_standalone_grade', // AI is never a standalone grade
] as const;

export type SnapshotItemClass =
  | (typeof SNAPSHOT_INCLUDED_CLASSES)[number]
  | (typeof SNAPSHOT_EXCLUDED_CLASSES)[number];

/**
 * A candidate item for a snapshot, drawn from a source module's read model. The
 * assembly filter decides whether it belongs in the self-contained copy. Selection
 * flags (`parentSelected` / `parentApproved` / `advisoryLabeled`) are the adult
 * gate: async produces drafts, adults produce truth (invariant 4).
 */
export interface SnapshotSourceItem {
  id: string;
  itemClass: SnapshotItemClass;
  /** The Student the item belongs to; assembly rejects cross-student items. */
  studentId: string;
  /** Evidence / photos enter only when the parent SELECTED them. */
  parentSelected?: boolean;
  /** Official Grades enter only when parent-APPROVED (record-of-truth). */
  parentApproved?: boolean;
  /** AI-assessment context enters only when advisory-LABELED (never a grade). */
  advisoryLabeled?: boolean;
  /** Opaque payload reference carried into the self-contained copy. */
  ref?: string;
}

/** One included item in the frozen, self-contained snapshot copy. */
export interface SnapshotContentItem {
  id: string;
  itemClass: (typeof SNAPSHOT_INCLUDED_CLASSES)[number];
  ref?: string;
}

/** An item the exclusion filter rejected, with a content-free reason. */
export interface ExcludedItem {
  id: string;
  itemClass: SnapshotItemClass;
  reason: string;
}

/** The result of assembling snapshot content (pure). */
export interface SnapshotAssembly {
  included: SnapshotContentItem[];
  excluded: ExcludedItem[];
}

/**
 * A Portfolio Snapshot: an immutable, self-contained, parent-approved record of
 * one Student's year. Bound to exactly one Student + School Year. Immutable via
 * supersession (invariant 5): a logged Owner reopen supersedes it with a new
 * Draft; the prior copy is never mutated. NOT an accredited transcript.
 */
export interface PortfolioSnapshot {
  id: string;
  studentId: string;
  schoolYearId: string;
  state: SnapshotState;
  outcome: SchoolYearOutcome;
  /** 1-based version; increments as reopens supersede. */
  version: number;
  supersedesSnapshotId: string | null;
  /** The self-contained, filtered content copy (answer-key-free by rule). */
  content: SnapshotContentItem[];
  /** Items the exclusion filter rejected, retained content-free for the audit. */
  excluded: ExcludedItem[];
  /** The Owner who approved the immutable copy. */
  approvedByUid: string | null;
  createdAt: number;
  updatedAt: number;
}

/** The minimal view of a prior snapshot needed to chain a reopen supersession. */
export interface PriorSnapshotRef {
  id: string;
  version: number;
}

/** The supersession chain link for a new snapshot version (mirrors Official Grade). */
export interface SnapshotChain {
  version: number;
  supersedesSnapshotId: string | null;
}
