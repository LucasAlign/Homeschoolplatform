// Module F — Mastery & Adaptation: canonical types.
// See docs/mvp-specification.md §5 (Mastery), §9 and issue #6. Module F turns
// accumulated, evidence-backed signals into an advisory Mastery observation that
// a Parent Admin confirms into a canonical level, and gates remediation/
// enrichment drafts on MULTIPLE signals — a single low-confidence AI Assessment
// can never trigger adaptation, and a draft reaches Planning (module C) only via
// parent approval (invariant 4; never auto-inserted into a plan).

// --- Mastery lifecycle (§5) ---
//
//   Observed (advisory, evidence-backed, confidence)
//     → Confirmed (Parent Admin only)
//       → Superseded (a newer confirmation replaced it)
// Confirmations are immutable and append-only (invariant 5).
export const MASTERY_STATES = ['Observed', 'Confirmed', 'Superseded'] as const;
export type MasteryState = (typeof MASTERY_STATES)[number];

/** Canonical proficiency scale — the ONLY levels an adult confirms. */
export const MASTERY_LEVELS = [
  'NotYetAssessed',
  'Emerging',
  'Developing',
  'Proficient',
  'Advanced',
] as const;
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

/**
 * A Mastery Record: an advisory observation, or a parent-confirmed canonical
 * level. Immutable via supersession — a correction or re-confirmation is a NEW
 * record pointing back via `supersedesRecordId`.
 */
export interface MasteryRecord {
  id: string;
  studentId: string;
  /** Opaque skill/standard identifier the record is about. */
  skillId: string;
  state: MasteryState;
  level: MasteryLevel;
  /** Ids of the evidence/assessment signals this record rests on. */
  evidenceBasis: string[];
  /** Advisory 0–1 confidence in the observation. */
  confidence: number;
  /** The confirming Parent Admin / Household Owner (null while Observed). */
  confirmedByUid: string | null;
  supersedesRecordId: string | null;
  createdAt: number;
  updatedAt: number;
}

// --- Multi-signal adaptation gating (§9) ---
//
// Remediation (below-level) and enrichment (above-level) drafts require either
// multiple qualifying signals OR one strong parent-reviewed result meeting
// configured confidence + recency thresholds. One low-confidence AI Assessment
// alone is never enough.
export type AdaptationKind = 'remediation' | 'enrichment';

export type SignalKind = 'ai_assessment' | 'parent_reviewed_grade' | 'mastery_observation';

/** One accumulated signal about a Student+skill, an input to the gate. */
export interface AdaptationSignal {
  kind: SignalKind;
  /** 0–1 confidence of the signal. */
  confidence: number;
  /** True for a parent-reviewed Official Grade or a confirmed Mastery Record. */
  parentReviewed: boolean;
  /** How many days ago the signal was produced (recency window). */
  ageDays: number;
}

/** Configured thresholds the gate evaluates against (parent/household policy). */
export interface AdaptationThresholds {
  /** Minimum confidence for a signal to qualify. */
  minConfidence: number;
  /** Maximum age (days) for a signal to still count. */
  maxAgeDays: number;
  /** Minimum qualifying signals when no single strong parent-reviewed result. */
  minSignals: number;
}

/**
 * A remediation/enrichment draft. ADVISORY: it is never auto-inserted into a
 * plan — it reaches Planning (module C) only through a parent approval.
 */
export interface RemediationDraft {
  id: string;
  studentId: string;
  skillId: string;
  kind: AdaptationKind;
  /** The signals that satisfied the gate (retained for the parent to review). */
  basis: string[];
  /** Set once a parent approves it toward Planning; null while advisory. */
  approvedByUid: string | null;
  createdAt: number;
}
