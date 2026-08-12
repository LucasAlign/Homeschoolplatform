import { describe, expect, it } from 'vitest';
import {
  resolveDeferralPolicy,
  canReorderSameDay,
  validateDeferral,
  withinWorkloadCap,
  dailyWorkload,
  isStaleProposal,
  validateReflow,
  isWithinAutoReflowBounds,
  daysBetween,
  sameWeek,
} from '../../src/modules/planning/scheduling-logic';
import type {
  DeferralPolicy,
  DeferralPolicyConfig,
  ScheduledAssignment,
} from '../../src/modules/planning/types';

const policy: DeferralPolicy = {
  allowReorderSameDay: true,
  maxDeferralDays: 5,
  dailyWorkloadCap: 100,
  autoReflowWithinWeek: true,
};

function a(over: Partial<ScheduledAssignment> = {}): ScheduledAssignment {
  return {
    assignmentId: 'a1',
    courseId: 'c1',
    date: '2026-09-07', // a Monday
    order: 0,
    sequenceIndex: 0,
    fixed: false,
    deferrable: true,
    workloadUnits: 10,
    ...over,
  };
}

describe('date helpers', () => {
  it('computes day deltas and ISO weeks', () => {
    expect(daysBetween('2026-09-07', '2026-09-10')).toBe(3);
    expect(sameWeek('2026-09-07', '2026-09-11')).toBe(true); // Mon..Fri same week
    expect(sameWeek('2026-09-07', '2026-09-14')).toBe(false); // next Monday
  });
});

describe('deferral policy resolution (most specific wins)', () => {
  const config: DeferralPolicyConfig = {
    household: policy,
    perStudent: { s1: { maxDeferralDays: 3 } },
    perCourse: { c1: { maxDeferralDays: 1 } },
  };
  it('course overrides student overrides household', () => {
    expect(resolveDeferralPolicy(config, 's1', 'c1').maxDeferralDays).toBe(1);
    expect(resolveDeferralPolicy(config, 's1', 'cX').maxDeferralDays).toBe(3);
    expect(resolveDeferralPolicy(config, 'sX', 'cX').maxDeferralDays).toBe(5);
  });
});

describe('student agency guards', () => {
  it('reorder allowed only when policy permits and item not fixed', () => {
    expect(canReorderSameDay(policy, a())).toBe(true);
    expect(canReorderSameDay(policy, a({ fixed: true }))).toBe(false);
    expect(canReorderSameDay({ ...policy, allowReorderSameDay: false }, a())).toBe(false);
  });

  it('rejects deferral of fixed / non-deferrable / out-of-window / backward', () => {
    expect(validateDeferral(policy, a({ fixed: true }), '2026-09-09').ok).toBe(false);
    expect(validateDeferral(policy, a({ deferrable: false }), '2026-09-09').ok).toBe(false);
    expect(validateDeferral(policy, a(), '2026-09-07').ok).toBe(false); // same day
    expect(validateDeferral(policy, a(), '2026-09-20').ok).toBe(false); // beyond 5 days
    expect(validateDeferral(policy, a(), '2026-09-10').ok).toBe(true);
  });
});

describe('workload caps', () => {
  it('sums per-day workload and enforces the cap', () => {
    const day = [a({ assignmentId: 'x', workloadUnits: 60 }), a({ assignmentId: 'y', workloadUnits: 50 })];
    expect(dailyWorkload(day, '2026-09-07')).toBe(110);
    expect(withinWorkloadCap(day, 100)).toBe(false);
    expect(withinWorkloadCap([a({ workloadUnits: 40 })], 100)).toBe(true);
  });
});

describe('optimistic concurrency', () => {
  it('flags a proposal computed against a superseded revision', () => {
    expect(isStaleProposal({ basedOnRevisionId: 'r1' }, 'r1')).toBe(false);
    expect(isStaleProposal({ basedOnRevisionId: 'r1' }, 'r2')).toBe(true);
    expect(isStaleProposal({ basedOnRevisionId: null }, null)).toBe(false);
  });
});

describe('reflow validation', () => {
  const before = [
    a({ assignmentId: 'a1', sequenceIndex: 0, date: '2026-09-07' }),
    a({ assignmentId: 'a2', sequenceIndex: 1, date: '2026-09-08', fixed: true }),
    a({ assignmentId: 'a3', sequenceIndex: 2, date: '2026-09-09' }),
  ];

  it('rejects moving a fixed assignment', () => {
    const after = before.map((x) => (x.assignmentId === 'a2' ? { ...x, date: '2026-09-10' } : x));
    expect(validateReflow(before, after, policy).ok).toBe(false);
  });

  it('rejects reflow that breaks sequence order', () => {
    const after = [
      { ...before[0], date: '2026-09-11' }, // a1 (seq 0) now after a3 (seq 2)
      before[1],
      before[2],
    ];
    expect(validateReflow(before, after, policy).ok).toBe(false);
  });

  it('accepts an in-bounds same-week reflow and marks it auto-appliable', () => {
    const after = before.map((x) => (x.assignmentId === 'a3' ? { ...x, date: '2026-09-11' } : x));
    expect(validateReflow(before, after, policy).ok).toBe(true);
    expect(isWithinAutoReflowBounds(before, after, policy)).toBe(true);
  });

  it('does not auto-apply a cross-week move', () => {
    const after = before.map((x) => (x.assignmentId === 'a3' ? { ...x, date: '2026-09-16' } : x));
    expect(isWithinAutoReflowBounds(before, after, policy)).toBe(false);
  });

  it('does not auto-apply when policy forbids it', () => {
    const after = before.map((x) => (x.assignmentId === 'a3' ? { ...x, date: '2026-09-11' } : x));
    expect(isWithinAutoReflowBounds(before, after, { ...policy, autoReflowWithinWeek: false })).toBe(false);
  });
});
