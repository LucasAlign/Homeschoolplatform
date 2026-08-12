// Module — Pilot: metric aggregation (pure logic, unit-tested).
//
// Rolls many metadata-only `TelemetryEvent`s up into per-family aggregates that
// feed the go/no-go scorecard. Pure and deterministic — no I/O. Aggregates are
// intentionally coarse (rates and means over the cohort): small-cohort results
// must not be re-identifiable (§18), so callers gate publication on a minimum
// cohort size (`MIN_AGGREGATION_COHORT`) rather than emitting per-household rows.

import type { MetricAggregate, MetricFamily, TelemetryEvent } from './types';

/** Below this many distinct households an aggregate is suppressed as re-identifiable. */
export const MIN_AGGREGATION_COHORT = 5;

function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Aggregate all events of a single family. The shape returned varies by family:
 * only the fields meaningful for that family are populated (the rest stay
 * undefined), mirroring how the scorecard reads each one.
 */
export function aggregateFamily(family: MetricFamily, events: TelemetryEvent[]): MetricAggregate {
  const own = events.filter((e) => e.family === family);
  const agg: MetricAggregate = { family, sampleCount: own.length };

  switch (family) {
    case 'efficiency': {
      const durations = own.map((e) => e.durationMs).filter((d): d is number => typeof d === 'number');
      agg.meanDurationMs = mean(durations);
      break;
    }
    case 'ai_acceptance': {
      const decided = own.filter((e) => e.approvalOutcome !== undefined);
      const accepted = decided.filter((e) => e.approvalOutcome === 'accepted').length;
      agg.acceptanceRate = decided.length === 0 ? undefined : accepted / decided.length;
      break;
    }
    case 'ingestion': {
      const outcomes = own.filter((e) => e.operationOutcome !== undefined);
      const ok = outcomes.filter((e) => e.operationOutcome === 'success').length;
      agg.successRate = outcomes.length === 0 ? undefined : ok / outcomes.length;
      break;
    }
    case 'independence': {
      // Each independent_work event carries count = independent completions and
      // count of total submissions is the sample; we model the rate as the share
      // of events flagged independent (operationOutcome 'success' = unaided).
      const total = own.length;
      const unaided = own.filter((e) => e.operationOutcome === 'success').length;
      agg.independenceRate = total === 0 ? undefined : unaided / total;
      break;
    }
    case 'cost': {
      // Mean cost-units per distinct Student across the cohort.
      const perStudent = new Map<string, number>();
      for (const e of own) {
        const key = e.studentRef ?? '__household__';
        perStudent.set(key, (perStudent.get(key) ?? 0) + (e.costUnits ?? 0));
      }
      agg.meanCostUnitsPerStudent = mean([...perStudent.values()]);
      break;
    }
    case 'safety': {
      agg.unresolvedSev1Count = own.filter((e) => e.sev1Unresolved === true).length;
      break;
    }
    case 'portfolio': {
      const scores = own.map((e) => e.usefulnessScore).filter((s): s is number => typeof s === 'number');
      agg.meanUsefulness = mean(scores);
      break;
    }
  }

  return agg;
}

/** Aggregate every family present, returned in a stable family order. */
export function aggregateAll(events: TelemetryEvent[]): MetricAggregate[] {
  const families: MetricFamily[] = [
    'efficiency',
    'ingestion',
    'ai_acceptance',
    'independence',
    'cost',
    'safety',
    'portfolio',
  ];
  return families.map((f) => aggregateFamily(f, events));
}

/** Distinct pseudonymous households represented in an event set. */
export function distinctHouseholds(events: TelemetryEvent[]): number {
  return new Set(events.map((e) => e.householdRef)).size;
}

/**
 * Whether an aggregate may be published without re-identifying a small cohort
 * (§18). Below the cohort floor the aggregate must be withheld or coarsened.
 */
export function isAggregatePublishable(events: TelemetryEvent[]): boolean {
  return distinctHouseholds(events) >= MIN_AGGREGATION_COHORT;
}
