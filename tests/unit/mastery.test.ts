import { describe, expect, it } from 'vitest';
import {
  canTransition,
  assertTransition,
  isTerminalMastery,
  isCanonicalLevel,
  MasteryTransitionError,
} from '../../src/modules/mastery/mastery-transitions';
import { canDraftAdaptation } from '../../src/modules/mastery/remediation-gating';
import type { AdaptationSignal, AdaptationThresholds } from '../../src/modules/mastery/types';

const thresholds: AdaptationThresholds = { minConfidence: 0.7, maxAgeDays: 30, minSignals: 2 };

const signal = (over: Partial<AdaptationSignal> = {}): AdaptationSignal => ({
  kind: 'ai_assessment',
  confidence: 0.9,
  parentReviewed: false,
  ageDays: 1,
  ...over,
});

// --- mastery transition legality ---
describe('mastery transition legality', () => {
  it('permits Observed → Confirmed → Superseded', () => {
    expect(canTransition('Observed', 'Confirmed')).toBe(true);
    expect(canTransition('Confirmed', 'Superseded')).toBe(true);
    expect(canTransition('Observed', 'Superseded')).toBe(true);
  });

  it('makes Superseded terminal and rejects backward jumps', () => {
    expect(isTerminalMastery('Superseded')).toBe(true);
    expect(canTransition('Confirmed', 'Observed')).toBe(false);
    expect(canTransition('Superseded', 'Confirmed')).toBe(false);
    expect(() => assertTransition('Confirmed', 'Observed')).toThrow(MasteryTransitionError);
  });

  it('recognizes only canonical scale levels', () => {
    expect(isCanonicalLevel('Proficient')).toBe(true);
    expect(isCanonicalLevel('NotYetAssessed')).toBe(true);
    expect(isCanonicalLevel('Mastered')).toBe(false);
    expect(isCanonicalLevel('proficient')).toBe(false);
  });
});

// --- multi-signal remediation gating ---
describe('multi-signal adaptation gating', () => {
  it('never triggers on a single low-confidence AI assessment', () => {
    const r = canDraftAdaptation([signal({ confidence: 0.4 })], thresholds);
    expect(r.ok).toBe(false);
    expect(r.qualifying).toHaveLength(0);
  });

  it('never triggers on a single ordinary AI-assessment signal', () => {
    // One qualifying-but-not-parent-reviewed signal is short of minSignals.
    expect(canDraftAdaptation([signal()], thresholds).ok).toBe(false);
  });

  it('triggers on one strong parent-reviewed result meeting thresholds', () => {
    const r = canDraftAdaptation(
      [signal({ kind: 'parent_reviewed_grade', parentReviewed: true })],
      thresholds,
    );
    expect(r.ok).toBe(true);
    expect(r.qualifying).toHaveLength(1);
  });

  it('triggers on multiple independent qualifying signals', () => {
    const r = canDraftAdaptation([signal(), signal({ kind: 'mastery_observation' })], thresholds);
    expect(r.ok).toBe(true);
    expect(r.qualifying).toHaveLength(2);
  });

  it('drops stale or low-confidence signals before counting', () => {
    const r = canDraftAdaptation(
      [signal({ ageDays: 90 }), signal({ confidence: 0.5 }), signal()],
      thresholds,
    );
    // Only one of the three qualifies → below minSignals, no parent-reviewed.
    expect(r.ok).toBe(false);
    expect(r.qualifying).toHaveLength(1);
  });

  it('a stale parent-reviewed result does not count', () => {
    const r = canDraftAdaptation(
      [signal({ kind: 'parent_reviewed_grade', parentReviewed: true, ageDays: 120 })],
      thresholds,
    );
    expect(r.ok).toBe(false);
  });
});
