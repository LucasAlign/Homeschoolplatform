// Module E — grade-approval routing (pure logic, unit-tested).
// docs/mvp-specification.md §8 and issue #7.
//
// Decides HOW an advisory AI Assessment reaches an Official Grade — but never
// that it becomes one automatically. No AI result is an Official Grade without a
// recorded adult approval (invariant 4); routing only chooses the review lane:
//
//   batch       — high-confidence objective-autoscorable, no forcing signal
//   individual  — subjective-rubric, reviewed one at a time
//   manual      — forced by transcription / a flag / low confidence /
//                 missing evidence / a large swing from the prior grade
//   parent_only — not-assessable-needs-adult (no number; straight to the parent)

import type { AssessabilityClass, ApprovalRoute, RoutingSignals } from './types';

/** Mirror of the ingestion batch threshold (§8: "high-confidence"). */
export const BATCH_CONFIDENCE_THRESHOLD = 0.85;

export interface RoutingInput {
  assessabilityClass: AssessabilityClass;
  /** Envelope confidence (0–1), or null when not-assessable. */
  confidence: number | null;
  signals: RoutingSignals;
}

export interface RoutingDecision {
  route: ApprovalRoute;
  /** True only when the assessment may clear via a batch approval. */
  batchEligible: boolean;
  reason: string;
}

/** Any of these forces individual manual review regardless of class/confidence. */
function forcingSignal(signals: RoutingSignals): string | null {
  if (signals.transcribed) return 'transcribed content requires adult review';
  if (signals.flagged) return 'flagged work requires adult review';
  if (signals.missingEvidence) return 'missing evidence requires adult review';
  if (signals.largeSwing) return 'large swing from prior grade requires adult review';
  return null;
}

export function routeApproval(input: RoutingInput): RoutingDecision {
  // Not-assessable → straight to the parent, no number, no batch.
  if (input.assessabilityClass === 'not-assessable-needs-adult') {
    return { route: 'parent_only', batchEligible: false, reason: 'not assessable; needs adult' };
  }

  // Forcing signals always drop to manual, even for objective work.
  const forced = forcingSignal(input.signals);
  if (forced) {
    return { route: 'manual', batchEligible: false, reason: forced };
  }

  // Low confidence is always manual.
  const confident = (input.confidence ?? 0) >= BATCH_CONFIDENCE_THRESHOLD;
  if (!confident) {
    return { route: 'manual', batchEligible: false, reason: 'low confidence requires adult review' };
  }

  // Subjective work is reviewed individually even at high confidence.
  if (input.assessabilityClass === 'subjective-rubric') {
    return { route: 'individual', batchEligible: false, reason: 'subjective rubric; individual review' };
  }

  // High-confidence objective-autoscorable with no forcing signal: batchable.
  return { route: 'batch', batchEligible: true, reason: 'high-confidence objective; batch-eligible' };
}

/** Convenience predicate for the operation layer's batch guard. */
export function isBatchApprovable(input: RoutingInput): boolean {
  return routeApproval(input).batchEligible;
}
