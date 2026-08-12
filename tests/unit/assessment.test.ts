import { describe, expect, it } from 'vitest';
import {
  canTransition,
  assertTransition,
  isTerminalAssessment,
  AssessmentTransitionError,
} from '../../src/modules/assessment/assessment-state-machine';
import {
  disclosureComplete,
  assessabilityFor,
  contextHasAnswerKeyMaterial,
} from '../../src/modules/assessment/disclosure';
import { routeApproval, isBatchApprovable } from '../../src/modules/assessment/grade-routing';
import {
  nextGradeChain,
  computeDivergence,
  isLargeSwing,
} from '../../src/modules/assessment/official-grade';
import type { DisclosureEnvelope, RoutingSignals } from '../../src/modules/assessment/types';

const NO_SIGNALS: RoutingSignals = {
  transcribed: false,
  flagged: false,
  missingEvidence: false,
  largeSwing: false,
};

const completeEnvelope = (over: Partial<DisclosureEnvelope> = {}): DisclosureEnvelope => ({
  suggestedScore: 0.9,
  rationale: 'clear',
  confidence: 0.95,
  uncertainty: { unreadPortions: [], notes: '' },
  assistance: { supportEventCount: 0, usedAICount: 0, hardStopCount: 0 },
  evidenceExamined: ['ev1'],
  ...over,
});

// --- assessment state machine ---
describe('assessment state machine (module E scope)', () => {
  it('runs AIAssessing → AssessmentReady and allows supersession', () => {
    expect(canTransition('AIAssessing', 'AssessmentReady')).toBe(true);
    expect(canTransition('AIAssessing', 'Superseded')).toBe(true);
    expect(canTransition('AssessmentReady', 'Superseded')).toBe(true);
  });

  it('makes Superseded terminal and rejects backward jumps', () => {
    expect(isTerminalAssessment('Superseded')).toBe(true);
    expect(canTransition('Superseded', 'AssessmentReady')).toBe(false);
    expect(canTransition('AssessmentReady', 'AIAssessing')).toBe(false);
    expect(() => assertTransition('Superseded', 'AssessmentReady')).toThrow(AssessmentTransitionError);
  });
});

// --- disclosure envelope completeness gate ---
describe('disclosure envelope completeness', () => {
  it('accepts an envelope carrying score + confidence + uncertainty', () => {
    expect(disclosureComplete(completeEnvelope()).ok).toBe(true);
  });

  it('rejects when confidence, uncertainty, or the score is missing', () => {
    expect(disclosureComplete(completeEnvelope({ confidence: null })).ok).toBe(false);
    expect(disclosureComplete(completeEnvelope({ uncertainty: null })).ok).toBe(false);
    expect(disclosureComplete(completeEnvelope({ suggestedScore: null })).ok).toBe(false);
  });
});

// --- assessability classification (§8) ---
describe('assessability classification', () => {
  it('classifies objective vs subjective from a complete envelope', () => {
    expect(assessabilityFor('objective', completeEnvelope())).toBe('objective-autoscorable');
    expect(assessabilityFor('subjective', completeEnvelope())).toBe('subjective-rubric');
  });

  it('routes observation work to needs-adult regardless of the envelope', () => {
    expect(assessabilityFor('observation', completeEnvelope())).toBe('not-assessable-needs-adult');
  });

  it('falls back to needs-adult when confidence + uncertainty cannot be populated', () => {
    expect(assessabilityFor('objective', completeEnvelope({ confidence: null }))).toBe(
      'not-assessable-needs-adult',
    );
    expect(assessabilityFor('subjective', completeEnvelope({ uncertainty: null }))).toBe(
      'not-assessable-needs-adult',
    );
  });
});

// --- answer-key isolation guard (invariant 2) ---
describe('assessment context answer-key guard', () => {
  it('detects forbidden answer-key material in a context', () => {
    expect(contextHasAnswerKeyMaterial({ submission: '...' })).toBe(false);
    expect(contextHasAnswerKeyMaterial({ answerKey: '...' })).toBe(true);
    expect(contextHasAnswerKeyMaterial({ answers: [1, 2] })).toBe(true);
    expect(contextHasAnswerKeyMaterial({ teacherGuide: '...' })).toBe(true);
  });
});

// --- grade-approval routing (batch vs manual eligibility) ---
describe('grade-approval routing', () => {
  it('batches only high-confidence objective work with no forcing signal', () => {
    const d = routeApproval({
      assessabilityClass: 'objective-autoscorable',
      confidence: 0.9,
      signals: NO_SIGNALS,
    });
    expect(d.route).toBe('batch');
    expect(d.batchEligible).toBe(true);
  });

  it('sends subjective rubric work to individual review even at high confidence', () => {
    const d = routeApproval({
      assessabilityClass: 'subjective-rubric',
      confidence: 0.99,
      signals: NO_SIGNALS,
    });
    expect(d.route).toBe('individual');
    expect(d.batchEligible).toBe(false);
  });

  it('sends not-assessable straight to the parent with no batch', () => {
    const d = routeApproval({
      assessabilityClass: 'not-assessable-needs-adult',
      confidence: null,
      signals: NO_SIGNALS,
    });
    expect(d.route).toBe('parent_only');
    expect(d.batchEligible).toBe(false);
  });

  it('forces manual review on low confidence', () => {
    expect(
      routeApproval({ assessabilityClass: 'objective-autoscorable', confidence: 0.5, signals: NO_SIGNALS }).route,
    ).toBe('manual');
  });

  it('forces manual review on any forcing signal, even for objective work', () => {
    const cases: (keyof RoutingSignals)[] = ['transcribed', 'flagged', 'missingEvidence', 'largeSwing'];
    for (const key of cases) {
      const d = routeApproval({
        assessabilityClass: 'objective-autoscorable',
        confidence: 0.99,
        signals: { ...NO_SIGNALS, [key]: true },
      });
      expect(d.route).toBe('manual');
      expect(d.batchEligible).toBe(false);
    }
  });

  it('isBatchApprovable agrees with the routing decision', () => {
    expect(
      isBatchApprovable({ assessabilityClass: 'objective-autoscorable', confidence: 0.9, signals: NO_SIGNALS }),
    ).toBe(true);
    expect(
      isBatchApprovable({ assessabilityClass: 'subjective-rubric', confidence: 0.9, signals: NO_SIGNALS }),
    ).toBe(false);
  });
});

// --- official-grade supersession chaining ---
describe('official grade supersession + divergence', () => {
  it('starts at version 1 with no supersession', () => {
    expect(nextGradeChain(null)).toEqual({ version: 1, supersedesGradeId: null });
  });

  it('increments version and chains supersession on resubmission', () => {
    expect(nextGradeChain({ id: 'g1', version: 1, finalScore: 0.8 })).toEqual({
      version: 2,
      supersedesGradeId: 'g1',
    });
  });

  it('retains parent-override divergence from the AI suggestion', () => {
    expect(computeDivergence(0.8, 0.8)).toEqual({ overridden: false, delta: 0 });
    expect(computeDivergence(0.8, 1)).toEqual({ overridden: true, delta: expect.closeTo(0.2) });
    expect(computeDivergence(null, 0.9)).toEqual({ overridden: false, delta: null });
  });

  it('flags a large swing from the prior grade only when both scores exist', () => {
    expect(isLargeSwing(0.9, 0.5)).toBe(true);
    expect(isLargeSwing(0.9, 0.8)).toBe(false);
    expect(isLargeSwing(null, 0.5)).toBe(false);
    expect(isLargeSwing(0.9, null)).toBe(false);
  });
});
