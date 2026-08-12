import { describe, expect, it } from 'vitest';
import {
  assertMetadataOnly,
  isMetadataOnly,
  TelemetryPrivacyError,
} from '../../src/modules/pilot/telemetry-validation';
import {
  aggregateFamily,
  aggregateAll,
  distinctHouseholds,
  isAggregatePublishable,
  MIN_AGGREGATION_COHORT,
} from '../../src/modules/pilot/metrics';
import {
  evaluateScorecard,
  targetMeetsThreshold,
  isValidException,
} from '../../src/modules/pilot/scorecard';
import {
  MIN_ACTIVE_WEEKS,
  MIN_PILOT_HOUSEHOLDS,
  SEV1_CATEGORIES,
  type HardGateInputs,
  type Sev1Category,
  type TargetMetric,
  type TelemetryEvent,
} from '../../src/modules/pilot/types';

// --- A valid, metadata-only telemetry event fixture ---
function event(over: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    id: 'ev1',
    householdRef: 'h-pseudo-1',
    studentRef: 's-pseudo-1',
    family: 'ai_acceptance',
    operation: 'grade_approve',
    approvalOutcome: 'accepted',
    at: 1_700_000_000_000,
    ...over,
  };
}

// --- The HARD rule: content can NEVER enter telemetry ---
describe('assertMetadataOnly (content-free guarantee)', () => {
  it('accepts a well-formed metadata-only event', () => {
    expect(() => assertMetadataOnly(event())).not.toThrow();
    expect(isMetadataOnly(event())).toBe(true);
  });

  it('rejects any unknown field not in the allowlist', () => {
    const leak = { ...event(), extra: 'whatever' };
    expect(() => assertMetadataOnly(leak)).toThrow(TelemetryPrivacyError);
    expect(isMetadataOnly(leak)).toBe(false);
  });

  it('rejects content/PII-suggestive keys even if someone tried to smuggle them', () => {
    // Each of these is both outside the allowlist AND matches a content substring.
    for (const key of [
      'studentContent',
      'submissionBody',
      'answerKey',
      'rawPrompt',
      'aiOutput',
      'studentName',
      'parentEmail',
      'evidenceText',
      'note',
    ]) {
      const leak = { ...event(), [key]: 'the actual student work' };
      expect(() => assertMetadataOnly(leak), key).toThrow(TelemetryPrivacyError);
    }
  });

  it('rejects a raw id or email masquerading as a pseudonymous ref', () => {
    expect(() => assertMetadataOnly(event({ householdRef: 'witeyford@gmail.com' }))).toThrow(
      TelemetryPrivacyError,
    );
    // A long hex string reads as a raw Firestore doc id / uid, not a pseudonym.
    expect(() => assertMetadataOnly(event({ householdRef: 'a1b2c3d4e5f60718' }))).toThrow(
      TelemetryPrivacyError,
    );
    expect(() => assertMetadataOnly(event({ studentRef: 'deadbeefdeadbeef00' }))).toThrow(
      TelemetryPrivacyError,
    );
  });

  it('rejects non-objects and arrays', () => {
    expect(() => assertMetadataOnly(null)).toThrow(TelemetryPrivacyError);
    expect(() => assertMetadataOnly('a string of student work')).toThrow(TelemetryPrivacyError);
    expect(() => assertMetadataOnly(['array'])).toThrow(TelemetryPrivacyError);
  });

  it('rejects out-of-range / non-finite numeric metadata', () => {
    expect(() => assertMetadataOnly(event({ durationMs: -1 }))).toThrow(TelemetryPrivacyError);
    expect(() => assertMetadataOnly(event({ costUnits: Number.NaN }))).toThrow(TelemetryPrivacyError);
    expect(() => assertMetadataOnly(event({ usefulnessScore: 6 }))).toThrow(TelemetryPrivacyError);
    expect(() => assertMetadataOnly(event({ usefulnessScore: 4 }))).not.toThrow();
  });
});

// --- Metric aggregation ---
describe('metric aggregation', () => {
  it('efficiency: mean active duration', () => {
    const evs = [
      event({ family: 'efficiency', operation: 'daily_review', durationMs: 200_000 }),
      event({ family: 'efficiency', operation: 'daily_review', durationMs: 100_000 }),
    ];
    expect(aggregateFamily('efficiency', evs).meanDurationMs).toBe(150_000);
  });

  it('ai_acceptance: accepted / all-decided', () => {
    const evs = [
      event({ approvalOutcome: 'accepted' }),
      event({ approvalOutcome: 'accepted' }),
      event({ approvalOutcome: 'edited' }),
      event({ approvalOutcome: 'overridden' }),
    ];
    expect(aggregateFamily('ai_acceptance', evs).acceptanceRate).toBe(0.5);
  });

  it('ingestion: success rate over outcomes', () => {
    const evs = [
      event({ family: 'ingestion', operation: 'ingestion_run', approvalOutcome: undefined, operationOutcome: 'success' }),
      event({ family: 'ingestion', operation: 'ingestion_run', approvalOutcome: undefined, operationOutcome: 'failure' }),
    ];
    expect(aggregateFamily('ingestion', evs).successRate).toBe(0.5);
  });

  it('cost: mean cost-units per distinct Student', () => {
    const evs = [
      event({ family: 'cost', operation: 'ai_call', studentRef: 's-a', approvalOutcome: undefined, costUnits: 10 }),
      event({ family: 'cost', operation: 'ai_call', studentRef: 's-a', approvalOutcome: undefined, costUnits: 10 }),
      event({ family: 'cost', operation: 'ai_call', studentRef: 's-b', approvalOutcome: undefined, costUnits: 4 }),
    ];
    // s-a totals 20, s-b totals 4 → mean 12 per student.
    expect(aggregateFamily('cost', evs).meanCostUnitsPerStudent).toBe(12);
  });

  it('safety: counts only UNRESOLVED sev-1 events', () => {
    const evs = [
      event({ family: 'safety', operation: 'safety_event', approvalOutcome: undefined, sev1Category: 'privacy', sev1Unresolved: true }),
      event({ family: 'safety', operation: 'safety_event', approvalOutcome: undefined, sev1Category: 'billing', sev1Unresolved: false }),
    ];
    expect(aggregateFamily('safety', evs).unresolvedSev1Count).toBe(1);
  });

  it('portfolio: mean adult-reported usefulness', () => {
    const evs = [
      event({ family: 'portfolio', operation: 'portfolio_report', approvalOutcome: undefined, usefulnessScore: 5 }),
      event({ family: 'portfolio', operation: 'portfolio_report', approvalOutcome: undefined, usefulnessScore: 3 }),
    ];
    expect(aggregateFamily('portfolio', evs).meanUsefulness).toBe(4);
  });

  it('empty family yields undefined rates (no divide-by-zero)', () => {
    expect(aggregateFamily('ai_acceptance', []).acceptanceRate).toBeUndefined();
    expect(aggregateAll([])).toHaveLength(7);
  });

  it('small-cohort aggregates are suppressed as re-identifiable', () => {
    const few = Array.from({ length: MIN_AGGREGATION_COHORT - 1 }, (_, i) =>
      event({ householdRef: `h-${i}` }),
    );
    expect(distinctHouseholds(few)).toBe(MIN_AGGREGATION_COHORT - 1);
    expect(isAggregatePublishable(few)).toBe(false);

    const enough = Array.from({ length: MIN_AGGREGATION_COHORT }, (_, i) =>
      event({ householdRef: `h-${i}` }),
    );
    expect(isAggregatePublishable(enough)).toBe(true);
  });
});

// --- Go / no-go scorecard ---
function zeroSev1(): Record<Sev1Category, number> {
  return Object.fromEntries(SEV1_CATEGORIES.map((c) => [c, 0])) as Record<Sev1Category, number>;
}

function passingHardGates(over: Partial<HardGateInputs> = {}): HardGateInputs {
  return {
    householdsEnrolled: MIN_PILOT_HOUSEHOLDS,
    activeWeeks: MIN_ACTIVE_WEEKS,
    unresolvedSev1: zeroSev1(),
    isolationVerified: true,
    consentVerified: true,
    answerKeyIsolationVerified: true,
    deletionExportVerified: true,
    perStudentCostWithinModel: true,
    ...over,
  };
}

function target(over: Partial<TargetMetric> = {}): TargetMetric {
  return {
    key: 'daily_review_time',
    family: 'efficiency',
    thresholdDescription: '≤ 5 active min',
    observed: 4,
    threshold: 5,
    higherIsBetter: false,
    ...over,
  };
}

describe('scorecard evaluation', () => {
  it('GO when all hard gates pass and all targets meet threshold', () => {
    const sc = evaluateScorecard({ hardGates: passingHardGates(), targets: [target()] }, 1);
    expect(sc.decision).toBe('GO');
    expect(sc.blockingReasons).toHaveLength(0);
    expect(sc.evaluatedAt).toBe(1);
  });

  it('targetMeetsThreshold respects direction', () => {
    expect(targetMeetsThreshold(target({ observed: 5, threshold: 5, higherIsBetter: false }))).toBe(true);
    expect(targetMeetsThreshold(target({ observed: 6, threshold: 5, higherIsBetter: false }))).toBe(false);
    expect(targetMeetsThreshold(target({ observed: 0.8, threshold: 0.7, higherIsBetter: true }))).toBe(true);
    expect(targetMeetsThreshold(target({ observed: 0.6, threshold: 0.7, higherIsBetter: true }))).toBe(false);
  });

  it('a single hard-gate failure short-circuits to NO-GO', () => {
    const sc = evaluateScorecard(
      { hardGates: passingHardGates({ householdsEnrolled: 9 }), targets: [target()] },
      1,
    );
    expect(sc.decision).toBe('NO_GO');
    expect(sc.blockingReasons.some((r) => r.includes('HARD GATE FAILED'))).toBe(true);
  });

  it('ANY unresolved sev-1 (each category) forces NO-GO', () => {
    for (const cat of SEV1_CATEGORIES) {
      const sev1 = zeroSev1();
      sev1[cat] = 1;
      const sc = evaluateScorecard(
        { hardGates: passingHardGates({ unresolvedSev1: sev1 }), targets: [target()] },
        1,
      );
      expect(sc.decision, cat).toBe('NO_GO');
      expect(sc.blockingReasons.some((r) => r.includes(cat)), cat).toBe(true);
    }
  });

  it('each verification flag is a hard gate', () => {
    for (const flag of [
      'isolationVerified',
      'consentVerified',
      'answerKeyIsolationVerified',
      'deletionExportVerified',
      'perStudentCostWithinModel',
    ] as const) {
      const sc = evaluateScorecard(
        { hardGates: passingHardGates({ [flag]: false }), targets: [target()] },
        1,
      );
      expect(sc.decision, flag).toBe('NO_GO');
    }
  });

  it('a missed target with NO exception forces NO-GO', () => {
    const sc = evaluateScorecard(
      { hardGates: passingHardGates(), targets: [target({ observed: 12 })] },
      1,
    );
    expect(sc.decision).toBe('NO_GO');
    expect(sc.blockingReasons.some((r) => r.includes('TARGET MISSED'))).toBe(true);
  });

  it('a missed target WITH a valid documented exception is GO (conditional)', () => {
    const sc = evaluateScorecard(
      {
        hardGates: passingHardGates(),
        targets: [target({ observed: 12 })],
        exceptions: [
          {
            metricKey: 'daily_review_time',
            evidenceRef: 'issue-42',
            correctivePlan: 'batch-approval UI ships in fast-follow',
            approvedByOwnerUid: 'owner-uid',
          },
        ],
      },
      1,
    );
    expect(sc.decision).toBe('GO');
    const line = sc.lines.find((l) => l.key === 'daily_review_time');
    expect(line?.passed).toBe(true);
    expect(line?.waivedByException).toBe(true);
  });

  it('an incomplete exception (missing corrective plan) does NOT waive the miss', () => {
    expect(
      isValidException('daily_review_time', [
        { metricKey: 'daily_review_time', evidenceRef: 'issue-42', correctivePlan: '', approvedByOwnerUid: 'owner' },
      ]),
    ).toBe(false);
    const sc = evaluateScorecard(
      {
        hardGates: passingHardGates(),
        targets: [target({ observed: 12 })],
        exceptions: [
          { metricKey: 'daily_review_time', evidenceRef: '', correctivePlan: 'plan', approvedByOwnerUid: 'owner' },
        ],
      },
      1,
    );
    expect(sc.decision).toBe('NO_GO');
  });

  it('a documented exception can NEVER waive a hard gate', () => {
    // Even if an "exception" names a hard-gate key, the hard tier ignores it.
    const sc = evaluateScorecard(
      {
        hardGates: passingHardGates({ unresolvedSev1: { ...zeroSev1(), privacy: 1 } }),
        targets: [target()],
        exceptions: [
          {
            metricKey: 'sev1_privacy',
            evidenceRef: 'issue-99',
            correctivePlan: 'we promise to fix it',
            approvedByOwnerUid: 'owner',
          },
        ],
      },
      1,
    );
    expect(sc.decision).toBe('NO_GO');
    expect(sc.blockingReasons.some((r) => r.includes('HARD GATE FAILED') && r.includes('privacy'))).toBe(true);
  });
});
