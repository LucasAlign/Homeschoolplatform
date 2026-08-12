// Module — Pilot: go/no-go scorecard evaluation (pure logic, unit-tested).
//
// The launch decision (§18). Two tiers:
//
//   HARD gates (non-waivable): ≥10 households × 4 active weeks on the full loop;
//   ZERO unresolved sev-1 privacy/authorization/answer-key/data-loss/billing/
//   child-safety defects; verified isolation/consent/answer-key/deletion-export;
//   per-Student cost within the model. ANY hard-gate failure ⇒ NO-GO, and NO
//   documented exception may waive one — this is the safety/privacy/authorization/
//   integrity/answer-key/parental-authority floor.
//
//   TARGET metrics (efficiency, AI-acceptance, independence, portfolio): a miss is
//   allowed ONLY when covered by a documented, evidence-backed exception with a
//   corrective plan, approved by the founder Household Owner (the launch
//   decision-maker). An uncovered miss ⇒ NO-GO.
//
// Evaluation SHORT-CIRCUITS to NO-GO on any hard-gate failure: the hard floor is
// checked first and a failure there stands regardless of the target tier. Pure and
// deterministic — the caller (pilot.ts) persists the result under Owner authority.

import {
  MIN_ACTIVE_WEEKS,
  MIN_PILOT_HOUSEHOLDS,
  SEV1_CATEGORIES,
  type DocumentedException,
  type HardGateInputs,
  type Scorecard,
  type ScorecardInput,
  type ScorecardLine,
  type TargetMetric,
} from './types';

/** Evaluate the hard-gate tier. Returns one line per gate; all must pass. */
function evaluateHardGates(g: HardGateInputs): ScorecardLine[] {
  const lines: ScorecardLine[] = [];

  lines.push({
    key: 'cohort_size',
    kind: 'hard_gate',
    passed: g.householdsEnrolled >= MIN_PILOT_HOUSEHOLDS,
    detail: `${g.householdsEnrolled}/${MIN_PILOT_HOUSEHOLDS} households enrolled`,
  });

  lines.push({
    key: 'active_weeks',
    kind: 'hard_gate',
    passed: g.activeWeeks >= MIN_ACTIVE_WEEKS,
    detail: `${g.activeWeeks}/${MIN_ACTIVE_WEEKS} active weeks on the full loop`,
  });

  // Zero unresolved sev-1 across every category (non-waivable). One line per
  // category so the scorecard names exactly which floor is breached.
  for (const cat of SEV1_CATEGORIES) {
    const count = g.unresolvedSev1[cat] ?? 0;
    lines.push({
      key: `sev1_${cat}`,
      kind: 'hard_gate',
      passed: count === 0,
      detail: count === 0 ? `no unresolved sev-1 ${cat} defect` : `${count} unresolved sev-1 ${cat} defect(s)`,
    });
  }

  lines.push({
    key: 'isolation_verified',
    kind: 'hard_gate',
    passed: g.isolationVerified === true,
    detail: g.isolationVerified ? 'household isolation verified' : 'household isolation NOT verified',
  });
  lines.push({
    key: 'consent_verified',
    kind: 'hard_gate',
    passed: g.consentVerified === true,
    detail: g.consentVerified ? 'consent gating verified' : 'consent gating NOT verified',
  });
  lines.push({
    key: 'answer_key_verified',
    kind: 'hard_gate',
    passed: g.answerKeyIsolationVerified === true,
    detail: g.answerKeyIsolationVerified ? 'answer-key isolation verified' : 'answer-key isolation NOT verified',
  });
  lines.push({
    key: 'deletion_export_verified',
    kind: 'hard_gate',
    passed: g.deletionExportVerified === true,
    detail: g.deletionExportVerified ? 'deletion + export verified' : 'deletion + export NOT verified',
  });
  lines.push({
    key: 'per_student_cost',
    kind: 'hard_gate',
    passed: g.perStudentCostWithinModel === true,
    detail: g.perStudentCostWithinModel
      ? 'per-Student cost within model with working caps'
      : 'per-Student cost OUTSIDE the model',
  });

  return lines;
}

/** Whether a single target metric meets its threshold, direction-aware. */
export function targetMeetsThreshold(t: TargetMetric): boolean {
  return t.higherIsBetter ? t.observed >= t.threshold : t.observed <= t.threshold;
}

/**
 * A documented exception is VALID for a missed target only when it references
 * the same metric, cites evidence, carries a corrective plan, and is approved by
 * the founder Household Owner. (A hard gate is never eligible — enforced by only
 * consulting exceptions in the target tier.)
 */
export function isValidException(
  metricKey: string,
  exceptions: DocumentedException[] | undefined,
): boolean {
  const ex = exceptions?.find((e) => e.metricKey === metricKey);
  if (!ex) return false;
  return (
    ex.evidenceRef.trim().length > 0 &&
    ex.correctivePlan.trim().length > 0 &&
    ex.approvedByOwnerUid.trim().length > 0
  );
}

/** Evaluate the target tier, applying documented exceptions to misses only. */
function evaluateTargets(
  targets: TargetMetric[],
  exceptions: DocumentedException[] | undefined,
): ScorecardLine[] {
  return targets.map((t) => {
    const met = targetMeetsThreshold(t);
    const waived = met ? false : isValidException(t.key, exceptions);
    return {
      key: t.key,
      kind: 'target' as const,
      passed: met || waived,
      waivedByException: waived,
      detail: met
        ? `${t.key} met (${t.observed} vs ${t.thresholdDescription})`
        : waived
          ? `${t.key} missed (${t.observed} vs ${t.thresholdDescription}) — covered by documented exception`
          : `${t.key} missed (${t.observed} vs ${t.thresholdDescription}) — NO documented exception`,
    };
  });
}

/**
 * Evaluate the full go/no-go scorecard. The decision is GO only when every hard
 * gate passes AND every target metric either meets its threshold or is covered by
 * a valid documented exception. A hard-gate failure alone forces NO-GO regardless
 * of the target tier (the safety/privacy/integrity floor cannot be waived).
 */
export function evaluateScorecard(input: ScorecardInput, now: number = Date.now()): Scorecard {
  const hardLines = evaluateHardGates(input.hardGates);
  const targetLines = evaluateTargets(input.targets, input.exceptions);
  const lines = [...hardLines, ...targetLines];

  const hardFailures = hardLines.filter((l) => !l.passed);
  const targetFailures = targetLines.filter((l) => !l.passed);

  const blockingReasons: string[] = [];
  // Hard gates first — a breach here stands no matter what the targets show.
  for (const l of hardFailures) {
    blockingReasons.push(`HARD GATE FAILED (non-waivable): ${l.detail}`);
  }
  for (const l of targetFailures) {
    blockingReasons.push(`TARGET MISSED without documented exception: ${l.detail}`);
  }

  const decision = blockingReasons.length === 0 ? 'GO' : 'NO_GO';

  return { decision, lines, blockingReasons, evaluatedAt: now };
}
