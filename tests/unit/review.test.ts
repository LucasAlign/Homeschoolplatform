import { describe, expect, it } from 'vitest';
import {
  canTransition,
  assertTransition,
  isTerminalFlag,
  isResolutionOutcome,
  FlagTransitionError,
} from '../../src/modules/review/flag-state-machine';
import {
  classifySignal,
  crossesThreshold,
  isReviewSignalKind,
  isNeutralFraming,
  flagBlocksLearning,
  flagEffect,
  ACCUSATORY_TERMS,
} from '../../src/modules/review/signal-classification';
import { routeToTier } from '../../src/modules/review/notification-routing';
import {
  aggregateForTier,
  buildDailyQueue,
  buildWeeklyDigest,
} from '../../src/modules/review/aggregation';
import {
  REVIEW_SIGNAL_KINDS,
  FORBIDDEN_SIGNAL_SOURCES,
  type Notification,
  type NotificationEvent,
  type ReviewSignal,
  type ReviewSignalKind,
} from '../../src/modules/review/types';

const signal = (over: Partial<ReviewSignal> = {}): ReviewSignal => ({
  kind: 'excessive_hints',
  studentId: 'stu-1',
  evidence: ['support-events:12'],
  observedValue: 12,
  threshold: 8,
  observedAt: 1000,
  ...over,
});

const event = (over: Partial<NotificationEvent> = {}): NotificationEvent => ({
  kind: 'review_flag',
  studentId: 'stu-1',
  sourceRef: 'flag-1',
  severity: 'routine',
  createdAt: 1000,
  ...over,
});

const note = (over: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  tier: 'Daily',
  kind: 'review_flag',
  studentId: 'stu-1',
  sourceRef: 'flag-1',
  state: 'Queued',
  createdAt: 1000,
  deliveredAt: null,
  ...over,
});

// --- Review Flag state machine ---
describe('review flag state machine', () => {
  it('runs Raised → Notified → Reviewed → Resolved', () => {
    expect(canTransition('Raised', 'Notified')).toBe(true);
    expect(canTransition('Notified', 'Reviewed')).toBe(true);
    expect(canTransition('Reviewed', 'Resolved')).toBe(true);
  });

  it('is strict and forward-only (no skips, no backward moves)', () => {
    expect(canTransition('Raised', 'Reviewed')).toBe(false);
    expect(canTransition('Notified', 'Resolved')).toBe(false);
    expect(canTransition('Reviewed', 'Notified')).toBe(false);
    expect(canTransition('Resolved', 'Reviewed')).toBe(false);
    expect(() => assertTransition('Raised', 'Resolved')).toThrow(FlagTransitionError);
  });

  it('makes Resolved terminal', () => {
    expect(isTerminalFlag('Resolved')).toBe(true);
    expect(isTerminalFlag('Notified')).toBe(false);
  });

  it('recognizes only the neutral resolution outcomes', () => {
    expect(isResolutionOutcome('dismissed')).toBe(true);
    expect(isResolutionOutcome('acknowledged')).toBe(true);
    expect(isResolutionOutcome('action-taken')).toBe(true);
    expect(isResolutionOutcome('confirmed_cheating')).toBe(false);
  });
});

// --- signal classification → flag creation ---
describe('review-signal classification', () => {
  it('raises a flag when an evidence-backed threshold signal is crossed', () => {
    const d = classifySignal(signal());
    expect(d.raise).toBe(true);
    expect(d.summary).not.toBeNull();
  });

  it('never raises a flag without evidence (a flag is always evidence-backed)', () => {
    expect(classifySignal(signal({ evidence: [] })).raise).toBe(false);
  });

  it('does not raise when the observation is below the concerning threshold', () => {
    // excessive_hints compares at_or_above: 4 hints under a threshold of 8.
    expect(classifySignal(signal({ observedValue: 4 })).raise).toBe(false);
  });

  it('handles at_or_below signals (implausibly fast work)', () => {
    const fast = signal({ kind: 'implausibly_fast_work', observedValue: 20, threshold: 60 });
    expect(classifySignal(fast).raise).toBe(true);
    const normal = signal({ kind: 'implausibly_fast_work', observedValue: 90, threshold: 60 });
    expect(classifySignal(normal).raise).toBe(false);
  });

  it('raises presence-based signals (tutor escalation, abnormal AI use) on evidence alone', () => {
    for (const kind of ['tutor_escalation', 'abnormal_ai_use', 'missing_evidence', 'submission_mismatch'] as const) {
      const d = classifySignal(signal({ kind, observedValue: undefined, threshold: undefined }));
      expect(d.raise).toBe(true);
    }
  });

  it('fails closed on an unrecognized (e.g. surveillance-derived) signal kind', () => {
    const bogus = signal({ kind: 'webcam' as unknown as ReviewSignalKind });
    expect(classifySignal(bogus).raise).toBe(false);
    expect(isReviewSignalKind('webcam')).toBe(false);
  });

  it('crossesThreshold treats presence kinds as always met', () => {
    expect(crossesThreshold('tutor_escalation', null, null)).toBe(true);
    expect(crossesThreshold('excessive_hints', null, null)).toBe(false);
  });
});

// --- neutrality guarantee (hard rule) ---
describe('neutrality guarantee', () => {
  it('produces only neutral, non-accusatory framing for every signal kind', () => {
    for (const kind of REVIEW_SIGNAL_KINDS) {
      // Equal observed/threshold crosses in either direction; presence kinds
      // ignore it — so every kind raises and yields a summary to check.
      const d = classifySignal(
        signal({ kind, evidence: ['ev'], observedValue: 0, threshold: 0 }),
      );
      expect(d.raise).toBe(true);
      expect(d.summary).not.toBeNull();
      expect(isNeutralFraming(d.summary as string)).toBe(true);
    }
  });

  it('rejects accusatory framing', () => {
    expect(isNeutralFraming('the student was cheating')).toBe(false);
    expect(isNeutralFraming('this looks suspicious')).toBe(false);
    expect(isNeutralFraming('worth an adult look')).toBe(true);
  });

  it('has a non-empty accusatory blocklist', () => {
    expect(ACCUSATORY_TERMS.length).toBeGreaterThan(0);
  });

  it('never lists a surveillance source as an allowed signal kind', () => {
    for (const forbidden of FORBIDDEN_SIGNAL_SOURCES) {
      expect((REVIEW_SIGNAL_KINDS as readonly string[]).includes(forbidden)).toBe(false);
    }
  });
});

// --- never blocks essential learning (invariant 7) ---
describe('a flag never blocks essential learning', () => {
  it('flagBlocksLearning is always false', () => {
    expect(flagBlocksLearning({ blocksLearning: false })).toBe(false);
  });

  it('a flag effect is advisory attention only', () => {
    expect(flagEffect()).toBe('advisory_attention_request');
  });
});

// --- notification-tier routing ---
describe('notification-tier routing', () => {
  it('routes security_urgent to Immediate', () => {
    expect(routeToTier(event({ kind: 'security_urgent' }))).toBe('Immediate');
  });

  it('routes a parent-defined urgent event to Immediate', () => {
    expect(routeToTier(event({ parentUrgent: true }))).toBe('Immediate');
    expect(routeToTier(event({ severity: 'urgent' }))).toBe('Immediate');
  });

  it('routes reviews, grades, and questionable completion to the Daily queue', () => {
    expect(routeToTier(event({ kind: 'review_flag' }))).toBe('Daily');
    expect(routeToTier(event({ kind: 'grade_ready' }))).toBe('Daily');
    expect(routeToTier(event({ kind: 'questionable_completion' }))).toBe('Daily');
  });

  it('routes progress/trends to the Weekly digest', () => {
    expect(routeToTier(event({ kind: 'progress_trend' }))).toBe('Weekly');
  });
});

// --- daily-queue & weekly-digest aggregation ---
describe('notification aggregation', () => {
  const notes: Notification[] = [
    note({ id: 'a', tier: 'Daily', kind: 'review_flag', studentId: 'stu-1', sourceRef: 'f1' }),
    note({ id: 'b', tier: 'Daily', kind: 'grade_ready', studentId: 'stu-1', sourceRef: 'g1' }),
    note({ id: 'c', tier: 'Daily', kind: 'review_flag', studentId: 'stu-2', sourceRef: 'f2' }),
    note({ id: 'd', tier: 'Weekly', kind: 'progress_trend', studentId: 'stu-1', sourceRef: 't1' }),
    note({ id: 'e', tier: 'Daily', kind: 'review_flag', studentId: 'stu-1', sourceRef: 'f3', state: 'Delivered' }),
  ];

  it('rolls up the daily queue by kind and student, excluding delivered', () => {
    const q = buildDailyQueue(notes);
    expect(q.tier).toBe('Daily');
    expect(q.total).toBe(3); // the Delivered one is excluded
    expect(q.byKind).toEqual({ review_flag: 2, grade_ready: 1 });
    expect(q.byStudent).toEqual({ 'stu-1': 2, 'stu-2': 1 });
    expect(q.sourceRefs).toEqual(['f1', 'g1', 'f2']);
  });

  it('rolls up the weekly digest', () => {
    const w = buildWeeklyDigest(notes);
    expect(w.total).toBe(1);
    expect(w.byKind).toEqual({ progress_trend: 1 });
  });

  it('returns an empty bucket when nothing is queued for a tier', () => {
    expect(aggregateForTier([], 'Immediate')).toEqual({
      tier: 'Immediate',
      total: 0,
      byKind: {},
      byStudent: {},
      sourceRefs: [],
    });
  });
});
