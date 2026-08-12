// Module G — the Review Flag lifecycle state machine (pure logic, unit-tested).
// docs/mvp-specification.md §5. Linear and strict: a flag advances one step at a
// time from Raised to Resolved and never moves backward. Evidence is immutable
// across the whole machine; only the resolution outcome is appended at the end.

import { RESOLUTION_OUTCOMES, type ResolutionOutcome, type ReviewFlagState } from './types';

const TRANSITIONS: Record<ReviewFlagState, ReviewFlagState[]> = {
  // A raised flag is routed to an adult by cadence tier.
  Raised: ['Notified'],
  // Once notified, an adult reviews it.
  Notified: ['Reviewed'],
  // A reviewed flag is closed with a recorded outcome.
  Reviewed: ['Resolved'],
  // Terminal: the outcome (dismissed / acknowledged / action-taken) is recorded.
  Resolved: [],
};

export const TERMINAL_FLAG_STATES: ReadonlySet<ReviewFlagState> = new Set(['Resolved']);

export function isTerminalFlag(state: ReviewFlagState): boolean {
  return TERMINAL_FLAG_STATES.has(state);
}

export function canTransition(from: ReviewFlagState, to: ReviewFlagState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class FlagTransitionError extends Error {
  constructor(from: ReviewFlagState, to: ReviewFlagState) {
    super(`illegal review-flag transition ${from} -> ${to}`);
    this.name = 'FlagTransitionError';
  }
}

export function assertTransition(from: ReviewFlagState, to: ReviewFlagState): void {
  if (!canTransition(from, to)) throw new FlagTransitionError(from, to);
}

/** A resolution outcome must be one of the neutral, recorded outcomes. */
export function isResolutionOutcome(value: string): value is ResolutionOutcome {
  return (RESOLUTION_OUTCOMES as readonly string[]).includes(value);
}
