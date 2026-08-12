// Module C — pure planning logic (unit-tested, no I/O).
// Encodes issue #6: bounded Student agency, workload caps, optimistic
// concurrency, and reflow that preserves fixed dates and sequence.

import type {
  DeferralPolicy,
  DeferralPolicyConfig,
  ProposedSchedule,
  ScheduledAssignment,
} from './types';

// --- date helpers (ISO YYYY-MM-DD, UTC) ---
export function parseDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDay(toIso) - parseDay(fromIso)) / 86_400_000);
}
export function weekStart(iso: string): number {
  const t = parseDay(iso);
  const dow = new Date(t).getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = (dow + 6) % 7;
  return t - mondayOffset * 86_400_000;
}
export function sameWeek(aIso: string, bIso: string): boolean {
  return weekStart(aIso) === weekStart(bIso);
}

// --- policy resolution (most specific wins: course > student > household) ---
export function resolveDeferralPolicy(
  config: DeferralPolicyConfig,
  studentId: string,
  courseId: string,
): DeferralPolicy {
  return {
    ...config.household,
    ...(config.perStudent[studentId] ?? {}),
    ...(config.perCourse[courseId] ?? {}),
  };
}

// --- Student agency guards ---
export function canReorderSameDay(policy: DeferralPolicy, a: ScheduledAssignment): boolean {
  return policy.allowReorderSameDay && !a.fixed;
}

export interface Check {
  ok: boolean;
  reason?: string;
}

export function validateDeferral(
  policy: DeferralPolicy,
  a: ScheduledAssignment,
  toDate: string,
): Check {
  if (a.fixed) return { ok: false, reason: 'assignment is fixed-date' };
  if (!a.deferrable) return { ok: false, reason: 'assignment is non-deferrable' };
  const delta = daysBetween(a.date, toDate);
  if (delta <= 0) return { ok: false, reason: 'deferral must move the date later' };
  if (delta > policy.maxDeferralDays) {
    return { ok: false, reason: `exceeds max deferral of ${policy.maxDeferralDays} days` };
  }
  return { ok: true };
}

// --- workload ---
export function dailyWorkload(placements: ScheduledAssignment[], date: string): number {
  return placements
    .filter((p) => p.date === date)
    .reduce((sum, p) => sum + p.workloadUnits, 0);
}
export function withinWorkloadCap(
  placements: ScheduledAssignment[],
  cap: number,
): boolean {
  const days = new Set(placements.map((p) => p.date));
  for (const d of days) {
    if (dailyWorkload(placements, d) > cap) return false;
  }
  return true;
}

// --- optimistic concurrency (issue #6) ---
/** A proposal is stale if it was computed against a revision that is no longer current. */
export function isStaleProposal(
  proposal: Pick<ProposedSchedule, 'basedOnRevisionId'>,
  currentRevisionId: string | null,
): boolean {
  return proposal.basedOnRevisionId !== currentRevisionId;
}

// --- reflow validation ---
function byId(list: ScheduledAssignment[]): Map<string, ScheduledAssignment> {
  return new Map(list.map((a) => [a.assignmentId, a]));
}

/** Reflow must preserve fixed-date items, sequence order, and workload caps. */
export function validateReflow(
  before: ScheduledAssignment[],
  after: ScheduledAssignment[],
  policy: DeferralPolicy,
): Check {
  const beforeById = byId(before);

  for (const a of after) {
    const b = beforeById.get(a.assignmentId);
    if (b?.fixed && b.date !== a.date) {
      return { ok: false, reason: `fixed assignment ${a.assignmentId} was moved` };
    }
  }

  // Sequence must be non-decreasing when ordered by (date, order).
  const ordered = [...after].sort((x, y) =>
    x.date === y.date ? x.order - y.order : parseDay(x.date) - parseDay(y.date),
  );
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].sequenceIndex < ordered[i - 1].sequenceIndex) {
      return { ok: false, reason: 'sequence order violated by reflow' };
    }
  }

  if (!withinWorkloadCap(after, policy.dailyWorkloadCap)) {
    return { ok: false, reason: 'reflow exceeds daily workload cap' };
  }
  return { ok: true };
}

/** Whether a reflow may auto-apply without parent approval (issue #6). */
export function isWithinAutoReflowBounds(
  before: ScheduledAssignment[],
  after: ScheduledAssignment[],
  policy: DeferralPolicy,
): boolean {
  if (!policy.autoReflowWithinWeek) return false;
  if (!validateReflow(before, after, policy).ok) return false;

  const beforeById = byId(before);
  for (const a of after) {
    const b = beforeById.get(a.assignmentId);
    if (b && b.date !== a.date && !sameWeek(b.date, a.date)) return false;
  }
  return true;
}
