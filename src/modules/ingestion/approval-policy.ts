// Module B — batch-approval eligibility (pure logic, unit-tested).
//
// Batch approval is offered ONLY for high-confidence, internally-consistent
// drafts with no blocking quality flags (issue #2/#7). Everything else drops to
// individual parent review. No AI result becomes an Official record without a
// recorded adult approval either way.

import type { ExtractedDraft } from './types';

export const BATCH_CONFIDENCE_THRESHOLD = 0.85;

const BLOCKING_FLAGS = new Set(['cutoff', 'low_confidence']);

export function isBatchApprovable(draft: ExtractedDraft): boolean {
  const hasBlockingFlag = draft.qualityFlags.some((f) => BLOCKING_FLAGS.has(f.kind));
  return (
    draft.internallyConsistent &&
    draft.overallConfidence >= BATCH_CONFIDENCE_THRESHOLD &&
    !hasBlockingFlag
  );
}
