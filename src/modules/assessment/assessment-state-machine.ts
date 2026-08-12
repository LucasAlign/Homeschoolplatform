// Module E — the AI Assessment lifecycle state machine (pure logic, unit-tested).
// docs/mvp-specification.md §5. This machine picks up where module D's machine
// ends (`Submitted`) and covers the advisory-assessment portion only. The
// Official Grade is a SEPARATE immutable record materialized on parent approval,
// not a state here (see grading.ts / official-grade.ts).

import type { AssessmentState } from './types';

const TRANSITIONS: Record<AssessmentState, AssessmentState[]> = {
  // The worker opens an assessment as AIAssessing, then publishes AssessmentReady.
  AIAssessing: ['AssessmentReady', 'Superseded'],
  // Ready for the parent-approval queue. A newer attempt supersedes it; parent
  // approval consumes it into an Official Grade WITHOUT a state change here.
  AssessmentReady: ['Superseded'],
  // Terminal: a superseding assessment (from a resubmission) replaced this one.
  Superseded: [],
};

export const TERMINAL_ASSESSMENT_STATES: ReadonlySet<AssessmentState> = new Set(['Superseded']);

export function isTerminalAssessment(state: AssessmentState): boolean {
  return TERMINAL_ASSESSMENT_STATES.has(state);
}

export function canTransition(from: AssessmentState, to: AssessmentState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class AssessmentTransitionError extends Error {
  constructor(from: AssessmentState, to: AssessmentState) {
    super(`illegal assessment transition ${from} -> ${to}`);
    this.name = 'AssessmentTransitionError';
  }
}

export function assertTransition(from: AssessmentState, to: AssessmentState): void {
  if (!canTransition(from, to)) throw new AssessmentTransitionError(from, to);
}
