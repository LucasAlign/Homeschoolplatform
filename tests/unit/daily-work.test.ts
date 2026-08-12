import { describe, expect, it } from 'vitest';
import {
  canTransition,
  assertTransition,
  isModuleDTerminal,
  SubmissionTransitionError,
} from '../../src/modules/daily-work/submission-state-machine';
import { evidenceSatisfies } from '../../src/modules/daily-work/evidence-policy';
import {
  nextZpdStep,
  zpdStepFor,
  evaluateHardStops,
  shouldEscalate,
  contextHasAnswerKeyMaterial,
} from '../../src/modules/daily-work/tutor-logic';
import { orderQueue, reconcile } from '../../src/modules/daily-work/offline-queue';
import type {
  Evidence,
  EvidencePolicy,
  QueuedOp,
  SubmissionSnapshot,
  TutorConfig,
} from '../../src/modules/daily-work/types';

// --- submission state machine ---
describe('submission state machine (module D scope)', () => {
  it('permits the canonical daily path and quick-submit', () => {
    expect(canTransition('Assigned', 'InProgress')).toBe(true);
    expect(canTransition('InProgress', 'Submitted')).toBe(true);
    expect(canTransition('Assigned', 'Submitted')).toBe(true); // no assistance logged
  });

  it('makes Submitted terminal for module D (hand-off to E)', () => {
    expect(isModuleDTerminal('Submitted')).toBe(true);
    expect(isModuleDTerminal('InProgress')).toBe(false);
    expect(canTransition('Submitted', 'InProgress')).toBe(false);
    expect(() => assertTransition('Submitted', 'Assigned')).toThrow(SubmissionTransitionError);
  });

  it('rejects backward and illegal jumps', () => {
    expect(canTransition('InProgress', 'Assigned')).toBe(false);
    expect(canTransition('Submitted', 'Submitted')).toBe(false);
  });
});

// --- evidence policy ---
describe('evidence policy satisfaction', () => {
  const ev = (kind: Evidence['kind'], id: string = kind): Evidence => ({
    id,
    submissionId: 's1',
    studentId: 'stu1',
    kind,
    createdAt: 0,
  });

  it('accepts observation-only work under a none/min-0 policy', () => {
    const policy: EvidencePolicy = { acceptedKinds: ['none'], minItems: 0, adultVerificationRequired: false };
    expect(evidenceSatisfies(policy, []).ok).toBe(true);
  });

  it('counts only accepted kinds toward the minimum', () => {
    const policy: EvidencePolicy = { acceptedKinds: ['photo', 'scan'], minItems: 2, adultVerificationRequired: false };
    expect(evidenceSatisfies(policy, [ev('photo', 'a'), ev('screenshot', 'b')]).ok).toBe(false);
    expect(evidenceSatisfies(policy, [ev('photo', 'a'), ev('scan', 'b')]).ok).toBe(true);
  });

  it('requires an adult verification item when the policy demands it', () => {
    const policy: EvidencePolicy = { acceptedKinds: ['adult_verification'], minItems: 1, adultVerificationRequired: true };
    expect(evidenceSatisfies(policy, [ev('photo', 'a')]).ok).toBe(false);
    expect(evidenceSatisfies(policy, [ev('adult_verification', 'v')]).ok).toBe(true);
  });
});

// --- tutor ZPD progression ---
describe('tutor ZPD progression', () => {
  it('advances through the scaffolding steps and saturates at check', () => {
    expect(nextZpdStep('diagnose')).toBe('hint');
    expect(nextZpdStep('hint')).toBe('parallel_example');
    expect(nextZpdStep('parallel_example')).toBe('chunk');
    expect(nextZpdStep('chunk')).toBe('check');
    expect(nextZpdStep('check')).toBe('check');
  });

  it('maps request types to steps; control requests have no step', () => {
    expect(zpdStepFor('hint')).toBe('hint');
    expect(zpdStepFor('example')).toBe('parallel_example');
    expect(zpdStepFor('answer_reveal')).toBeNull();
    expect(zpdStepFor('do_the_work')).toBeNull();
  });
});

// --- server-enforced hard-stops (§8) ---
describe('tutor hard-stops', () => {
  const graded: TutorConfig = { isGradedAssignment: true, answerRevealEnabled: false };
  const revealOn: TutorConfig = { isGradedAssignment: true, answerRevealEnabled: true };
  const ungraded: TutorConfig = { isGradedAssignment: false, answerRevealEnabled: false };

  it('never does the work', () => {
    const d = evaluateHardStops({ requestType: 'do_the_work', config: ungraded, onMaterial: true });
    expect(d.allowed).toBe(false);
    expect(d.reasons).toContain('would_do_the_work');
  });

  it('blocks graded-answer reveal unless a parent enabled it', () => {
    expect(evaluateHardStops({ requestType: 'answer_reveal', config: graded, onMaterial: true }).allowed).toBe(false);
    expect(evaluateHardStops({ requestType: 'answer_reveal', config: revealOn, onMaterial: true }).allowed).toBe(true);
    // Ungraded work is not answer-reveal-gated.
    expect(evaluateHardStops({ requestType: 'answer_reveal', config: ungraded, onMaterial: true }).allowed).toBe(true);
  });

  it('blocks anything off-material', () => {
    const d = evaluateHardStops({ requestType: 'hint', config: ungraded, onMaterial: false });
    expect(d.allowed).toBe(false);
    expect(d.reasons).toContain('off_material');
  });

  it('allows ordinary on-material scaffolding', () => {
    expect(evaluateHardStops({ requestType: 'hint', config: graded, onMaterial: true }).allowed).toBe(true);
  });

  it('accumulates multiple simultaneous hard-stop reasons', () => {
    const d = evaluateHardStops({ requestType: 'do_the_work', config: graded, onMaterial: false });
    expect(d.reasons).toEqual(expect.arrayContaining(['off_material', 'would_do_the_work']));
  });
});

// --- escalation ---
describe('tutor escalation', () => {
  const policy = { maxHints: 3, maxFailedChecks: 2, maxConsecutiveWrong: 3 };
  it('escalates once any difficulty bound is crossed', () => {
    expect(shouldEscalate({ hintsUsed: 2, failedChecks: 1, consecutiveWrong: 1 }, policy)).toBe(false);
    expect(shouldEscalate({ hintsUsed: 4, failedChecks: 0, consecutiveWrong: 0 }, policy)).toBe(true);
    expect(shouldEscalate({ hintsUsed: 0, failedChecks: 3, consecutiveWrong: 0 }, policy)).toBe(true);
  });
});

// --- answer-key isolation guard (invariant 2) ---
describe('tutor context answer-key guard', () => {
  it('detects forbidden answer-key material in a context', () => {
    expect(contextHasAnswerKeyMaterial({ prompt: 'help' })).toBe(false);
    expect(contextHasAnswerKeyMaterial({ prompt: 'help', answerKey: '...' })).toBe(true);
    expect(contextHasAnswerKeyMaterial({ teacherGuide: '...' })).toBe(true);
  });
});

// --- offline queue reconciliation ---
describe('offline queue reconciliation', () => {
  const server = (over: Partial<SubmissionSnapshot> = {}): SubmissionSnapshot => ({
    submissionId: 's1',
    state: 'Assigned',
    evidenceIds: [],
    supportEventIds: [],
    updatedAt: 100,
    ...over,
  });

  it('orders deterministically by (clientTs, opId)', () => {
    const ops: QueuedOp[] = [
      { opId: 'b', submissionId: 's1', kind: 'support_event', supportEventId: 'e2', clientTs: 200 },
      { opId: 'a', submissionId: 's1', kind: 'support_event', supportEventId: 'e1', clientTs: 200 },
      { opId: 'c', submissionId: 's1', kind: 'support_event', supportEventId: 'e0', clientTs: 150 },
    ];
    expect(orderQueue(ops).map((o) => o.opId)).toEqual(['c', 'a', 'b']);
  });

  it('replays a full offline daily loop on top of server authority', () => {
    const ops: QueuedOp[] = [
      { opId: '1', submissionId: 's1', kind: 'transition', to: 'InProgress', clientTs: 110 },
      { opId: '2', submissionId: 's1', kind: 'support_event', supportEventId: 'se1', clientTs: 120 },
      { opId: '3', submissionId: 's1', kind: 'attach_evidence', evidenceId: 'ev1', clientTs: 130 },
      { opId: '4', submissionId: 's1', kind: 'transition', to: 'Submitted', clientTs: 140 },
    ];
    const r = reconcile(server(), ops);
    expect(r.state.state).toBe('Submitted');
    expect(r.state.evidenceIds).toEqual(['ev1']);
    expect(r.state.supportEventIds).toEqual(['se1']);
    expect(r.applied).toHaveLength(4);
    expect(r.dropped).toHaveLength(0);
  });

  it('drops a transition that lost the race to a newer server write (LWW)', () => {
    // Server already advanced to Submitted at t=200; an older offline InProgress loses.
    const r = reconcile(server({ state: 'Submitted', updatedAt: 200 }), [
      { opId: '1', submissionId: 's1', kind: 'transition', to: 'InProgress', clientTs: 150 },
    ]);
    expect(r.state.state).toBe('Submitted');
    expect(r.dropped[0].reason).toBe('superseded_by_server');
  });

  it('keeps append-only evidence/support events even when a transition is dropped', () => {
    const r = reconcile(server({ state: 'Submitted', updatedAt: 200 }), [
      { opId: '1', submissionId: 's1', kind: 'attach_evidence', evidenceId: 'ev1', clientTs: 150 },
      { opId: '2', submissionId: 's1', kind: 'transition', to: 'InProgress', clientTs: 150 },
    ]);
    expect(r.state.evidenceIds).toEqual(['ev1']);
    expect(r.applied.map((o) => o.opId)).toContain('1');
    expect(r.dropped.map((o) => o.op.opId)).toContain('2');
  });

  it('dedups already-present evidence and support events (idempotent replay)', () => {
    const r = reconcile(server({ evidenceIds: ['ev1'], supportEventIds: ['se1'] }), [
      { opId: '1', submissionId: 's1', kind: 'attach_evidence', evidenceId: 'ev1', clientTs: 150 },
      { opId: '2', submissionId: 's1', kind: 'support_event', supportEventId: 'se1', clientTs: 150 },
    ]);
    expect(r.applied).toHaveLength(0);
    expect(r.dropped.every((d) => d.reason === 'duplicate')).toBe(true);
    expect(r.state.evidenceIds).toEqual(['ev1']);
  });

  it('drops an illegal transition rather than clobbering the server', () => {
    const r = reconcile(server({ state: 'Assigned', updatedAt: 100 }), [
      // Assigned -> Assigned is a no-op duplicate; Submitted then InProgress is illegal.
      { opId: '1', submissionId: 's1', kind: 'transition', to: 'Submitted', clientTs: 110 },
      { opId: '2', submissionId: 's1', kind: 'transition', to: 'InProgress', clientTs: 120 },
    ]);
    expect(r.state.state).toBe('Submitted');
    expect(r.dropped.find((d) => d.op.opId === '2')?.reason).toBe('illegal_transition');
  });

  it('ignores ops addressed to a different submission', () => {
    const r = reconcile(server(), [
      { opId: '1', submissionId: 'other', kind: 'transition', to: 'InProgress', clientTs: 110 },
    ]);
    expect(r.applied).toHaveLength(0);
    expect(r.dropped).toHaveLength(0);
    expect(r.state.state).toBe('Assigned');
  });
});
