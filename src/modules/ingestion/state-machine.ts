// Module B — the Import lifecycle state machine (pure logic, unit-tested).
// docs/mvp-specification.md §5.

import type { ImportState } from './types';

const TRANSITIONS: Record<ImportState, ImportState[]> = {
  Uploading: ['Uploaded', 'Failed'],
  Uploaded: ['Preflight', 'Failed'],
  Preflight: ['Queued', 'NeedsCorrection', 'Rejected', 'Failed'],
  Queued: ['Processing', 'Failed'],
  Processing: ['ExtractedDraft', 'NeedsCorrection', 'Failed'],
  ExtractedDraft: ['Approved', 'NeedsCorrection', 'Rejected'],
  NeedsCorrection: ['Uploaded', 'Preflight'],
  Approved: [],
  Failed: [],
  Rejected: [],
};

export const TERMINAL_STATES: ReadonlySet<ImportState> = new Set(['Approved', 'Failed', 'Rejected']);

export function isTerminal(state: ImportState): boolean {
  return TERMINAL_STATES.has(state);
}

export function canTransition(from: ImportState, to: ImportState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class ImportTransitionError extends Error {
  constructor(from: ImportState, to: ImportState) {
    super(`illegal import transition ${from} -> ${to}`);
    this.name = 'ImportTransitionError';
  }
}

export function assertTransition(from: ImportState, to: ImportState): void {
  if (!canTransition(from, to)) throw new ImportTransitionError(from, to);
}
