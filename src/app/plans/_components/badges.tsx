// Pure presentational badges for the plan-approval surface. Server components.

import type { ProposedSchedule } from '../../../modules/planning/types';

export function KindBadge({ kind }: { kind: ProposedSchedule['kind'] }) {
  const isFull = kind === 'full';
  const tone = isFull
    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
    : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {isFull ? 'Full schedule' : 'Change set'}
    </span>
  );
}

/** "Builds on revision N" (or "new plan" when there is no prior revision). */
export function BasedOnBadge({ revisionNumber }: { revisionNumber: number }) {
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      {revisionNumber === 0 ? 'New plan' : `Builds on rev ${revisionNumber}`}
    </span>
  );
}

/** Compact moved/added/removed counts for a change set. */
export function DiffSummary({
  moved,
  added,
  removed,
}: {
  moved: number;
  added: number;
  removed: number;
}) {
  if (moved === 0 && added === 0 && removed === 0) {
    return <span className="text-xs text-neutral-400">No changes vs current plan</span>;
  }
  const parts: string[] = [];
  if (moved) parts.push(`${moved} moved`);
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      {parts.join(' · ')}
    </span>
  );
}
