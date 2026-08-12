// Module E — Assessment & Grading: canonical types.
// See docs/mvp-specification.md §5 (Submission→Assessment→Official Grade), §7,
// §8 (assessment authority) and issue #7. Module E owns everything DOWNSTREAM of
// a Submitted submission (module D's hand-off): the advisory AI Assessment
// (AIAssessing → AssessmentReady) and the immutable, parent-approved Official
// Grade. It builds NO grade on its own — a recorded adult approval is the only
// path from an advisory assessment to an Official Grade (invariant 4).

// --- AI Assessment lifecycle (module E scope) ---
//
// Continues the canonical machine past module D's terminal `Submitted`:
//   Submitted → AIAssessing → AssessmentReady → (parent approval) → OfficialGrade
// The Official Grade is a SEPARATE immutable record, not a state of the
// assessment. Resubmission supersedes the whole chain (new Submission → new
// Assessment → superseding Official Grade), so an AssessmentReady assessment can
// be Superseded when a newer attempt arrives.
export const ASSESSMENT_STATES = ['AIAssessing', 'AssessmentReady', 'Superseded'] as const;
export type AssessmentState = (typeof ASSESSMENT_STATES)[number];

// --- Assessability class (§8) ---
//
// Every AI Assessment is tagged with how it can be graded. `not-assessable-
// needs-adult` carries NO number and routes straight to the parent. An
// assessment that cannot populate confidence + uncertainty always renders as
// `not-assessable-needs-adult` (see disclosure.ts).
export const ASSESSABILITY_CLASSES = [
  'objective-autoscorable',
  'subjective-rubric',
  'not-assessable-needs-adult',
] as const;
export type AssessabilityClass = (typeof ASSESSABILITY_CLASSES)[number];

/** The shape of the assigned work, an input to assessability classification. */
export type AssignmentKind = 'objective' | 'subjective' | 'observation';

/**
 * Assistance folded into the assessment's uncertainty (§8: assistance is
 * disclosed, never auto-penalized). Summarized from the Submission's Support
 * Events (module D) — never the raw tutoring content.
 */
export interface AssistanceContext {
  supportEventCount: number;
  /** How many Support Events routed through gateway J (an AI touched the work). */
  usedAICount: number;
  /** How many tutor requests were hard-stopped (context for the parent). */
  hardStopCount: number;
}

/** Portions the AI could not read/interpret; drives uncertainty and routing. */
export interface Uncertainty {
  /** Human-readable descriptors of unread/uninterpretable portions. */
  unreadPortions: string[];
  notes: string;
}

/**
 * The mandatory disclosure envelope (§8). It must let a parent see EXACTLY what
 * the advisory suggestion rests on. When `confidence` or `uncertainty` cannot be
 * populated the assessment is `not-assessable-needs-adult` and `suggestedScore`
 * stays null (no number).
 */
export interface DisclosureEnvelope {
  /** Advisory 0–1 suggested score, or null when not-assessable. */
  suggestedScore: number | null;
  rationale: string;
  /** Advisory 0–1 confidence, or null when it cannot be established. */
  confidence: number | null;
  /** Unread/uncertain portions, or null when uncertainty cannot be established. */
  uncertainty: Uncertainty | null;
  /** Assistance context from Support Events, folded into the reading. */
  assistance: AssistanceContext;
  /** Evidence ids the assessment examined (never the answer key — invariant 2). */
  evidenceExamined: string[];
}

/**
 * An advisory AI Assessment for one Submission. STRICTLY advisory for every
 * submission type; it never becomes record-of-truth without a parent approval.
 * Resubmission produces a new one that supersedes the prior (`supersedesAssessmentId`).
 */
export interface AIAssessment {
  id: string;
  submissionId: string;
  assignmentId: string;
  studentId: string;
  state: AssessmentState;
  assessabilityClass: AssessabilityClass;
  envelope: DisclosureEnvelope;
  supersedesAssessmentId: string | null;
  /** vendor/model/feature the gateway routed through (invariant 8 provenance). */
  aiProvenance: { vendor: string; model: string; feature: string } | null;
  createdAt: number;
  updatedAt: number;
}

// --- Official Grade (§8) ---
//
// Immutable, parent-approved record-of-truth. Resubmission SUPERSEDES (a new
// Official Grade pointing at the prior via `supersedesGradeId`); a parent may
// override the AI, and the divergence is retained. Students always see
// suggested-vs-final. Progression to the next step is NOT gated on grading.
export interface OfficialGrade {
  id: string;
  assignmentId: string;
  studentId: string;
  submissionId: string;
  /** The AI Assessment this grade was approved from (advisory provenance). */
  sourceAssessmentId: string;
  /** 1-based version; increments as resubmissions supersede. */
  version: number;
  supersedesGradeId: string | null;
  /** What the AI suggested (retained for suggested-vs-final), or null. */
  suggestedScore: number | null;
  /** The parent's final score (record-of-truth). */
  finalScore: number;
  /** True when the parent's final diverges from the AI suggestion. */
  parentOverride: boolean;
  /** The recorded adult approver (invariant 4: no grade without adult approval). */
  approvedByUid: string;
  /** Whether this was cleared through a batch approval (audit context). */
  viaBatch: boolean;
  createdAt: number;
}

// --- Parent-approval routing (§8) ---
//
// The path from an advisory assessment to an Official Grade. Batch approval is
// offered ONLY for high-confidence objective-autoscorable assessments;
// subjective-rubric is reviewed individually; a set of conditions force manual
// review; not-assessable goes straight to the parent with no number.
export type ApprovalRoute = 'batch' | 'individual' | 'manual' | 'parent_only';

export interface RoutingSignals {
  /** Student-transcribed content is involved (labeled/flagged upstream). */
  transcribed: boolean;
  /** A Review Flag or quality flag is attached to the work. */
  flagged: boolean;
  /** The Evidence Policy was not fully satisfied / evidence is missing. */
  missingEvidence: boolean;
  /** The suggestion is a large swing from the prior Official Grade. */
  largeSwing: boolean;
}
