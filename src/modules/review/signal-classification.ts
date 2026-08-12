// Module G — review-signal classification and the neutrality / non-blocking
// guarantees (pure logic, unit-tested). docs/mvp-specification.md §10, §17.
//
// A signal becomes a flag ONLY when it is (a) an allowed neutral signal kind,
// (b) evidence-backed, and (c) past its neutral threshold. The framing produced
// here is deliberately non-accusatory — every flag is a "worth an adult look"
// request, never a claim of misconduct. These are the decisions the review
// server (review.ts) makes before writing any Review Flag.

import {
  REVIEW_SIGNAL_KINDS,
  type ReviewFlag,
  type ReviewSignal,
  type ReviewSignalKind,
} from './types';

/** How a threshold-based signal is compared; `presence` signals carry no number. */
type Comparison = 'at_or_above' | 'at_or_below' | 'presence';

// Direction of concern per signal. `presence` kinds are already decided by their
// producer (module D tutor escalation, module J abnormal-use, an evidence check)
// and need no numeric threshold to warrant an adult look.
const SIGNAL_COMPARISON: Record<ReviewSignalKind, Comparison> = {
  implausibly_fast_work: 'at_or_below', // completed in fewer seconds than expected
  rapid_click_through: 'at_or_below', // advanced items faster than a floor
  repeated_low_grades: 'at_or_above', // count of consecutive low grades
  sudden_performance_change: 'at_or_above', // magnitude of the swing
  excessive_hints: 'at_or_above', // hints used
  missing_evidence: 'presence',
  submission_mismatch: 'presence',
  tutor_escalation: 'presence',
  abnormal_ai_use: 'presence',
};

// Neutral, non-accusatory descriptions. Every one frames the observation as a
// request for adult attention, not a verdict.
const NEUTRAL_DESCRIPTIONS: Record<ReviewSignalKind, string> = {
  implausibly_fast_work: 'work was completed faster than the expected range — worth an adult look',
  rapid_click_through: 'items advanced very quickly — worth an adult look',
  repeated_low_grades: 'several low grades in a row — worth an adult look',
  sudden_performance_change: 'a notable change in performance — worth an adult look',
  excessive_hints: 'a lot of hints were used — worth an adult look',
  missing_evidence: 'expected evidence was not attached — worth an adult look',
  submission_mismatch: 'the submitted work differs from what was expected — worth an adult look',
  tutor_escalation: 'the tutor asked for an adult after repeated difficulty — worth an adult look',
  abnormal_ai_use: 'an unusual pattern of AI use (metadata only) — worth an adult look',
};

/**
 * Words that would turn a neutral request into an accusation. The classifier's
 * framing must contain none of them; `isNeutralFraming` enforces it and the
 * tests assert every produced summary passes.
 */
export const ACCUSATORY_TERMS = [
  'cheat',
  'cheating',
  'lie',
  'lying',
  'liar',
  'fraud',
  'dishonest',
  'guilty',
  'misconduct',
  'suspect',
  'suspicious',
  'caught',
  'violation',
  'offender',
];

export function isReviewSignalKind(value: string): value is ReviewSignalKind {
  return (REVIEW_SIGNAL_KINDS as readonly string[]).includes(value);
}

/** True when the framing carries no accusatory language (neutrality guarantee). */
export function isNeutralFraming(text: string): boolean {
  const lower = text.toLowerCase();
  return !ACCUSATORY_TERMS.some((term) => new RegExp(`\\b${term}\\b`).test(lower));
}

/** Whether the observed measurement crosses the neutral threshold for its kind. */
export function crossesThreshold(
  kind: ReviewSignalKind,
  observedValue: number | null,
  threshold: number | null,
): boolean {
  const cmp = SIGNAL_COMPARISON[kind];
  if (cmp === 'presence') return true;
  if (observedValue === null || threshold === null) return false;
  return cmp === 'at_or_above' ? observedValue >= threshold : observedValue <= threshold;
}

export interface FlagDecision {
  raise: boolean;
  /** Short, content-free reason (for the audit trail). */
  reason: string;
  /** Neutral summary when a flag is warranted; null otherwise. */
  summary: string | null;
}

/**
 * Classify a raw review signal into a flag-creation decision. Fails closed:
 * an unrecognized (e.g. surveillance-derived) kind, an evidence-less signal, or
 * a below-threshold observation never raises a flag.
 */
export function classifySignal(signal: ReviewSignal): FlagDecision {
  // Only allowed neutral signal kinds are ever classified. A surveillance source
  // is not a member of REVIEW_SIGNAL_KINDS and is rejected here.
  if (!isReviewSignalKind(signal.kind)) {
    return { raise: false, reason: 'unrecognized_signal_kind', summary: null };
  }

  // A neutral flag is ALWAYS evidence-backed (§10).
  if (signal.evidence.length === 0) {
    return { raise: false, reason: 'not_evidence_backed', summary: null };
  }

  if (!crossesThreshold(signal.kind, signal.observedValue ?? null, signal.threshold ?? null)) {
    return { raise: false, reason: 'below_threshold', summary: null };
  }

  return { raise: true, reason: 'signal_warrants_review', summary: NEUTRAL_DESCRIPTIONS[signal.kind] };
}

// --- structural guarantees (testable predicates) ---

/**
 * A Review Flag never blocks essential learning (invariant 7). The record pins
 * `blocksLearning` to the literal `false`; this predicate reads it so the
 * guarantee is exercised at runtime as well as in the type.
 */
export function flagBlocksLearning(flag: Pick<ReviewFlag, 'blocksLearning'>): boolean {
  return flag.blocksLearning;
}

/** The effect of a flag is always advisory — it requests attention, nothing more. */
export function flagEffect(): 'advisory_attention_request' {
  return 'advisory_attention_request';
}
