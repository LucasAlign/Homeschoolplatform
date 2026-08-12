// Module D — the Submission lifecycle state machine (pure logic, unit-tested).
// docs/mvp-specification.md §5. This machine covers ONLY the module-D portion
// (Assigned → InProgress → Submitted). Submitted is terminal HERE and hands off
// to module E's async assessment (Phase 4); progression is never gated on grading.

import type { SubmissionState } from './types';

const TRANSITIONS: Record<SubmissionState, SubmissionState[]> = {
  Assigned: ['InProgress', 'Submitted'],
  InProgress: ['Submitted'],
  // Terminal for module D. Module E owns AIAssessing → AssessmentReady →
  // OfficialGrade; resubmission is a NEW Submission, not a transition out of here.
  Submitted: [],
};

/** States from which module D does no further work (the assessment boundary). */
export const MODULE_D_TERMINAL: ReadonlySet<SubmissionState> = new Set(['Submitted']);

export function isModuleDTerminal(state: SubmissionState): boolean {
  return MODULE_D_TERMINAL.has(state);
}

export function canTransition(from: SubmissionState, to: SubmissionState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class SubmissionTransitionError extends Error {
  constructor(from: SubmissionState, to: SubmissionState) {
    super(`illegal submission transition ${from} -> ${to}`);
    this.name = 'SubmissionTransitionError';
  }
}

export function assertTransition(from: SubmissionState, to: SubmissionState): void {
  if (!canTransition(from, to)) throw new SubmissionTransitionError(from, to);
}
