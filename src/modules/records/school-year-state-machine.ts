// Module H — School Year + Portfolio Snapshot state machines (pure logic,
// unit-tested). docs/mvp-specification.md §5. Two strict, forward-only machines:
//
//   School Year:  Active → Completed | Partial | Withdrawn   (outcomes terminal)
//   Snapshot:     Draft  → Approved → Superseded             (Superseded terminal)
//
// The completion transition out of `Active` is Household-Owner-only and gated on
// the completion preconditions (completion.ts); this file only encodes the LEGAL
// transitions, not the authority or the gate.

import type { SchoolYearState, SnapshotState } from './types';

// --- School Year ---

const YEAR_TRANSITIONS: Record<SchoolYearState, SchoolYearState[]> = {
  // The Owner completes the year into exactly one terminal outcome.
  Active: ['Completed', 'Partial', 'Withdrawn'],
  // Terminal outcomes of the reporting period — never reopened as a year (a
  // correction supersedes the SNAPSHOT, not the year's terminal state).
  Completed: [],
  Partial: [],
  Withdrawn: [],
};

export const TERMINAL_YEAR_STATES: ReadonlySet<SchoolYearState> = new Set([
  'Completed',
  'Partial',
  'Withdrawn',
]);

export function isTerminalYear(state: SchoolYearState): boolean {
  return TERMINAL_YEAR_STATES.has(state);
}

export function canTransitionYear(from: SchoolYearState, to: SchoolYearState): boolean {
  return YEAR_TRANSITIONS[from]?.includes(to) ?? false;
}

export class SchoolYearTransitionError extends Error {
  constructor(from: SchoolYearState, to: SchoolYearState) {
    super(`illegal school-year transition ${from} -> ${to}`);
    this.name = 'SchoolYearTransitionError';
  }
}

export function assertYearTransition(from: SchoolYearState, to: SchoolYearState): void {
  if (!canTransitionYear(from, to)) throw new SchoolYearTransitionError(from, to);
}

// --- Portfolio Snapshot ---

const SNAPSHOT_TRANSITIONS: Record<SnapshotState, SnapshotState[]> = {
  // A Draft is assembled, then the Owner approves it into the immutable copy.
  Draft: ['Approved'],
  // Approved is immutable; a logged Owner reopen supersedes it (a new Draft is
  // created separately, pointing back — the Approved copy is never mutated).
  Approved: ['Superseded'],
  // Terminal: a superseding snapshot (from a reopen) replaced this one.
  Superseded: [],
};

export const TERMINAL_SNAPSHOT_STATES: ReadonlySet<SnapshotState> = new Set(['Superseded']);

export function isTerminalSnapshot(state: SnapshotState): boolean {
  return TERMINAL_SNAPSHOT_STATES.has(state);
}

export function canTransitionSnapshot(from: SnapshotState, to: SnapshotState): boolean {
  return SNAPSHOT_TRANSITIONS[from]?.includes(to) ?? false;
}

export class SnapshotTransitionError extends Error {
  constructor(from: SnapshotState, to: SnapshotState) {
    super(`illegal snapshot transition ${from} -> ${to}`);
    this.name = 'SnapshotTransitionError';
  }
}

export function assertSnapshotTransition(from: SnapshotState, to: SnapshotState): void {
  if (!canTransitionSnapshot(from, to)) throw new SnapshotTransitionError(from, to);
}
