// Module F — the Mastery Record lifecycle state machine (pure logic, unit-tested).
// docs/mvp-specification.md §5, §9; invariant 5 (immutability via supersession).
//
//   Observed → Confirmed → Superseded
// Only a Parent Admin (or Household Owner) confirms a canonical level; the
// operation layer enforces that authority. Confirmations are append-only — a
// re-confirmation is a NEW record that supersedes, never a mutation.

import { MASTERY_LEVELS, type MasteryLevel, type MasteryState } from './types';

const TRANSITIONS: Record<MasteryState, MasteryState[]> = {
  Observed: ['Confirmed', 'Superseded'],
  Confirmed: ['Superseded'],
  Superseded: [],
};

export const TERMINAL_MASTERY_STATES: ReadonlySet<MasteryState> = new Set(['Superseded']);

export function isTerminalMastery(state: MasteryState): boolean {
  return TERMINAL_MASTERY_STATES.has(state);
}

export function canTransition(from: MasteryState, to: MasteryState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class MasteryTransitionError extends Error {
  constructor(from: MasteryState, to: MasteryState) {
    super(`illegal mastery transition ${from} -> ${to}`);
    this.name = 'MasteryTransitionError';
  }
}

export function assertTransition(from: MasteryState, to: MasteryState): void {
  if (!canTransition(from, to)) throw new MasteryTransitionError(from, to);
}

/** Whether a value is one of the canonical scale levels (rejects free text). */
export function isCanonicalLevel(level: string): level is MasteryLevel {
  return (MASTERY_LEVELS as readonly string[]).includes(level);
}
