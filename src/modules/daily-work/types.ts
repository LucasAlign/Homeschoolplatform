// Module D — Daily Work & Submission: canonical types.
// See docs/mvp-specification.md §5 (Submission→Assessment→Official Grade), §8
// (scaffolded tutor) and issue #7. This module owns the Assigned → Submitted
// portion of the daily loop; module E (Phase 4) owns everything downstream of
// Submitted (AIAssessing → AssessmentReady → OfficialGrade).

// --- Submission lifecycle (module D scope) ---
//
// The canonical machine continues past Submitted into module E:
//   Submitted → AIAssessing → AssessmentReady → (parent approval) → OfficialGrade
// Those states are OWNED BY MODULE E and are intentionally NOT modeled here.
// Module D stops at Submitted and enqueues the async assessment.
export const SUBMISSION_STATES = ['Assigned', 'InProgress', 'Submitted'] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];

// --- Evidence Policy (§8) ---
//
// The Evidence Policy declares what proof an Assignment requires. `none` is a
// legitimate policy (observation-only work). Adult verification is a parent
// attesting to off-platform work — it produces `adult_verification` Evidence.
export const EVIDENCE_KINDS = [
  'none',
  'photo',
  'scan',
  'file',
  'screenshot',
  'integration_result',
  'adult_verification',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Kinds whose payload is an uploaded Storage object (consent-gated path). */
export const UPLOAD_EVIDENCE_KINDS: ReadonlySet<EvidenceKind> = new Set<EvidenceKind>([
  'photo',
  'scan',
  'file',
  'screenshot',
]);

/**
 * What proof an Assignment requires. Attached to the Assignment (read model);
 * `submitWork` validates the Submission's Evidence against it.
 */
export interface EvidencePolicy {
  /** Evidence kinds that count toward the requirement. */
  acceptedKinds: EvidenceKind[];
  /** Minimum number of accepted-kind items (0 when `none` is acceptable). */
  minItems: number;
  /** When true, at least one `adult_verification` item is required. */
  adultVerificationRequired: boolean;
}

/**
 * A single piece of proof-of-work. Upload kinds reference a Storage object by
 * path (never inline content); `adult_verification` carries the verifying adult.
 */
export interface Evidence {
  id: string;
  submissionId: string;
  studentId: string;
  kind: EvidenceKind;
  /** Storage object path for upload kinds (households/{hid}/evidence/...). */
  storagePath?: string;
  /** Opaque result id for `integration_result`. */
  integrationResultId?: string;
  /** Verifying adult uid for `adult_verification`. */
  verifiedByUid?: string;
  createdAt: number;
}

/**
 * A Student's attempt at an Assignment. One Submission per attempt;
 * resubmission creates a NEW Submission that supersedes the prior one (the
 * superseding assessment/grade is materialized downstream in module E).
 */
export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  state: SubmissionState;
  /** 1-based attempt number for this Assignment. */
  attempt: number;
  supersedesSubmissionId: string | null;
  evidenceIds: string[];
  submittedAt: number | null;
  /** Set when Submitted and handed to module E's async assessment queue. */
  assessmentEnqueuedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

// --- Scaffolded tutor (§8) ---
//
// ZPD progression: diagnose the difficulty, offer a small hint, show a PARALLEL
// example (never the answer), chunk the problem, then check understanding.
export const ZPD_STEPS = [
  'diagnose',
  'hint',
  'parallel_example',
  'chunk',
  'check',
] as const;
export type ZpdStep = (typeof ZPD_STEPS)[number];

/** What the student is asking the tutor to do (classified before any AI call). */
export type TutorRequestType =
  | 'hint'
  | 'example'
  | 'check'
  | 'explain'
  | 'answer_reveal'
  | 'do_the_work';

/** Server-enforced hard-stop reasons (§8). None are waivable by the Student. */
export type HardStopReason =
  | 'graded_answer_reveal_disabled'
  | 'would_do_the_work'
  | 'off_material';

/** Kinds of logged Support Event (§8: every intervention is logged). */
export type SupportEventKind = ZpdStep | 'escalation' | 'blocked';

/** An immutable, logged tutor intervention (append-only assistance record). */
export interface SupportEvent {
  id: string;
  submissionId: string;
  studentId: string;
  assignmentId: string;
  kind: SupportEventKind;
  zpdStep: ZpdStep | null;
  /** For `blocked` events: the hard-stop reasons that fired. */
  hardStops: HardStopReason[];
  /** Whether this event routed through gateway J (an AI call was made). */
  usedAI: boolean;
  createdAt: number;
}

/**
 * Parent-controlled tutor configuration, resolved per Course/Assignment.
 * `answerRevealEnabled` is OFF by default and is the ONLY thing that lets the
 * tutor reveal a graded answer (§8).
 */
export interface TutorConfig {
  /** Whether this Assignment is graded (reveal is gated on graded work). */
  isGradedAssignment: boolean;
  /** Parent toggle (per Course/Assignment) permitting graded-answer reveal. */
  answerRevealEnabled: boolean;
}

/** Difficulty signals accumulated over a tutoring session (drives escalation). */
export interface DifficultySignal {
  hintsUsed: number;
  failedChecks: number;
  consecutiveWrong: number;
}

/** Bounds past which the tutor escalates to a parent rather than continuing. */
export interface EscalationPolicy {
  maxHints: number;
  maxFailedChecks: number;
  maxConsecutiveWrong: number;
}

// --- Offline queue (pure reconciliation model) ---
//
// The essential daily loop must survive offline: starting work, logging
// assistance, attaching evidence, and submitting are all queued locally and
// reconciled against server authority (last-write-wins) on reconnect.
export type QueuedOp =
  | { opId: string; submissionId: string; kind: 'transition'; to: SubmissionState; clientTs: number }
  | { opId: string; submissionId: string; kind: 'attach_evidence'; evidenceId: string; clientTs: number }
  | { opId: string; submissionId: string; kind: 'support_event'; supportEventId: string; clientTs: number };

/** Server-authoritative snapshot a queue is reconciled against. */
export interface SubmissionSnapshot {
  submissionId: string;
  state: SubmissionState;
  evidenceIds: string[];
  supportEventIds: string[];
  /** Server authority timestamp; a conflicting older client op loses (LWW). */
  updatedAt: number;
}

export type DropReason = 'duplicate' | 'superseded_by_server' | 'illegal_transition';

export interface ReconcileResult {
  state: SubmissionSnapshot;
  applied: QueuedOp[];
  dropped: { op: QueuedOp; reason: DropReason }[];
}
