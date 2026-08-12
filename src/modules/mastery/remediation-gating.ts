// Module F — multi-signal adaptation gating (pure logic, unit-tested).
// docs/mvp-specification.md §9 and issue #6.
//
// Remediation/enrichment drafts must be earned by evidence, not by a single weak
// signal. The gate qualifies a draft when EITHER:
//   - one strong, parent-reviewed result meets the confidence + recency
//     thresholds (a confirmed Mastery Record or a parent-reviewed Official
//     Grade), OR
//   - at least `minSignals` independent signals each meet the thresholds.
// One low-confidence AI Assessment on its own can never qualify a draft.

import type { AdaptationSignal, AdaptationThresholds } from './types';

export interface GateResult {
  ok: boolean;
  /** The signals that qualified (empty when the gate is not met). */
  qualifying: AdaptationSignal[];
  reason: string;
}

/** A signal counts only if it clears both the confidence and recency windows. */
function qualifies(signal: AdaptationSignal, t: AdaptationThresholds): boolean {
  return signal.confidence >= t.minConfidence && signal.ageDays <= t.maxAgeDays;
}

/**
 * Whether the accumulated signals justify drafting an adaptation. Pure and
 * deterministic so the parent-facing gate can be exhaustively tested.
 */
export function canDraftAdaptation(
  signals: AdaptationSignal[],
  thresholds: AdaptationThresholds,
): GateResult {
  const qualifying = signals.filter((s) => qualifies(s, thresholds));

  if (qualifying.length === 0) {
    return { ok: false, qualifying: [], reason: 'no signal meets confidence/recency thresholds' };
  }

  // One strong parent-reviewed result is sufficient on its own.
  const strongParentReviewed = qualifying.find((s) => s.parentReviewed);
  if (strongParentReviewed) {
    return { ok: true, qualifying, reason: 'strong parent-reviewed result meets thresholds' };
  }

  // Otherwise require multiple independent qualifying signals.
  if (qualifying.length >= thresholds.minSignals) {
    return { ok: true, qualifying, reason: `${qualifying.length} qualifying signals` };
  }

  return {
    ok: false,
    qualifying,
    reason: `only ${qualifying.length} qualifying signal(s); need ${thresholds.minSignals} or one parent-reviewed`,
  };
}
