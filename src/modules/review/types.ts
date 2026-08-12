// Module G — Review & Notifications: canonical types.
// See docs/mvp-specification.md §5 (Review Flag state machine), §10 (Review Flags
// & notifications), §17 (invariants) and issues #7, #13. A Review Flag is a
// NEUTRAL, evidence-backed request for adult attention — it NEVER asserts
// misconduct on its own and NEVER blocks essential learning (invariant 7). No
// type, enum, or field here carries accusatory language, and no signal is ever
// sourced from surveillance (no webcams, keylogging, background recording, or
// covert tracking — those never appear anywhere in this module).

// --- Review Flag lifecycle (§5) ---
//
//   Raised    (evidence + signal + neutral framing)
//     → Notified   (routed to an adult by cadence tier)
//       → Reviewed (an adult looked at it)
//         → Resolved (outcome recorded: dismissed / acknowledged / action-taken)
// Evidence captured at Raised is immutable; only the resolution outcome is added.
export const REVIEW_FLAG_STATES = ['Raised', 'Notified', 'Reviewed', 'Resolved'] as const;
export type ReviewFlagState = (typeof REVIEW_FLAG_STATES)[number];

/**
 * The recorded outcome of an adult review. All three are neutral: a flag may be
 * dismissed (no concern), acknowledged (noted, no action), or acted upon — none
 * of these is an accusation, and dismissal is a first-class, blameless outcome.
 */
export const RESOLUTION_OUTCOMES = ['dismissed', 'acknowledged', 'action-taken'] as const;
export type ResolutionOutcome = (typeof RESOLUTION_OUTCOMES)[number];

// --- Review signals (§10) ---
//
// The COMPLETE set of allowed signal sources. Each is a neutral, observable
// pattern in ordinary learning activity or a hand-off from another module
// (tutor escalation from module D; abnormal, metadata-only AI use from module J,
// pseudonymous per invariant on issue #13). This list is exhaustive by design:
// anything sourced from surveillance is not — and must never become — a member.
export const REVIEW_SIGNAL_KINDS = [
  'implausibly_fast_work',
  'rapid_click_through',
  'repeated_low_grades',
  'sudden_performance_change',
  'excessive_hints',
  'missing_evidence',
  'submission_mismatch',
  'tutor_escalation',
  'abnormal_ai_use',
] as const;
export type ReviewSignalKind = (typeof REVIEW_SIGNAL_KINDS)[number];

/**
 * Signal categories that are PROHIBITED. They are listed here only so the
 * neutrality/no-surveillance guarantees can be asserted against them in tests;
 * none is a `ReviewSignalKind` and none may ever be classified into a flag.
 */
export const FORBIDDEN_SIGNAL_SOURCES = [
  'webcam',
  'keylogging',
  'background_recording',
  'covert_tracking',
  'screen_recording',
] as const;

/**
 * A raw review signal handed to the classifier. Evidence is metadata-only —
 * opaque descriptors of what was observed, never student content and never a
 * surveillance capture. `observedValue`/`threshold` carry the neutral measurement
 * that a threshold-based signal crossed (e.g. seconds elapsed, hints used).
 */
export interface ReviewSignal {
  kind: ReviewSignalKind;
  studentId: string;
  /** Opaque reference to the observed record (submission / assessment / support event). */
  subjectRef?: string;
  /** The neutral measurement observed, when the signal is threshold-based. */
  observedValue?: number;
  /** The neutral threshold the observation is compared against. */
  threshold?: number;
  /** Metadata-only evidence descriptors — a flag is always evidence-backed. */
  evidence: string[];
  observedAt: number;
}

/**
 * A Review Flag: a neutral, evidence-backed request for adult attention. The
 * evidence and observed measurement are immutable once Raised; only review and
 * resolution bookkeeping is appended. `blocksLearning` is the literal `false` —
 * a flag structurally cannot sever essential learning (invariant 7).
 */
export interface ReviewFlag {
  id: string;
  studentId: string;
  signalKind: ReviewSignalKind;
  state: ReviewFlagState;
  /** Immutable metadata-only evidence descriptors captured at raise time. */
  evidence: string[];
  observedValue: number | null;
  threshold: number | null;
  subjectRef: string | null;
  /** Neutral, non-accusatory summary ("worth an adult look"). */
  summary: string;
  /** A flag never blocks essential learning; the type pins this to `false`. */
  blocksLearning: false;
  /** Outcome recorded on resolution; null until Resolved. */
  resolution: ResolutionOutcome | null;
  resolvedByUid: string | null;
  /** Optional neutral adult note recorded alongside the outcome. */
  resolutionNote: string | null;
  raisedAt: number;
  notifiedAt: number | null;
  reviewedAt: number | null;
  resolvedAt: number | null;
  updatedAt: number;
}

// --- Notifications & cadence tiers (§10) ---
//
//   Immediate — security / urgent parent-defined events.
//   Daily     — the daily review queue: reviews, grades, questionable completion.
//   Weekly    — the weekly digest: progress and trends.
export const NOTIFICATION_TIERS = ['Immediate', 'Daily', 'Weekly'] as const;
export type NotificationTier = (typeof NOTIFICATION_TIERS)[number];

/** What generated a notification (drives tier routing). */
export type NotificationKind =
  | 'review_flag' // a raised Review Flag → daily queue by default
  | 'grade_ready' // an Official Grade awaiting adult approval → daily queue
  | 'questionable_completion' // e.g. implausibly-fast/mismatched completion → daily queue
  | 'security_urgent' // security / child-safety → Immediate
  | 'progress_trend'; // progress / trend rollup → Weekly digest

/** Neutral severity of the underlying event; `urgent` escalates to Immediate. */
export type NotificationSeverity = 'routine' | 'urgent';

/**
 * An event to be routed to a cadence tier. `parentUrgent` marks a parent-defined
 * rule that promotes the event to Immediate (§10: "urgent parent-defined").
 */
export interface NotificationEvent {
  kind: NotificationKind;
  studentId: string;
  /** Reference to the flag / grade / rollup that generated the event. */
  sourceRef: string;
  severity: NotificationSeverity;
  /** A parent-defined rule flagged this event as urgent → Immediate. */
  parentUrgent?: boolean;
  createdAt: number;
}

/** A queued notification, server-written and adult-read. */
export interface Notification {
  id: string;
  tier: NotificationTier;
  kind: NotificationKind;
  studentId: string;
  sourceRef: string;
  state: 'Queued' | 'Delivered';
  createdAt: number;
  deliveredAt: number | null;
}

/**
 * A rolled-up view of queued notifications for one tier — the Daily queue or the
 * Weekly digest. Counts only; never student content.
 */
export interface DigestBucket {
  tier: NotificationTier;
  total: number;
  byKind: Record<string, number>;
  byStudent: Record<string, number>;
  /** Source references gathered for the adult to open. */
  sourceRefs: string[];
}
