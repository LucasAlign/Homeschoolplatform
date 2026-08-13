// Pure presentational badges for the grade-approval surface. Server components.

import { BATCH_CONFIDENCE_THRESHOLD } from '../../../modules/assessment/grade-routing';
import type {
  AssessabilityClass,
  ApprovalRoute,
} from '../../../modules/assessment/types';

/** Advisory suggested / final score, shown as a percentage (domain stores 0–1). */
export function ScoreBadge({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  if (value === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
        {label}: no number
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium tabular-nums text-blue-800 dark:bg-blue-950 dark:text-blue-300">
      {label}: {Math.round(value * 100)}%
    </span>
  );
}

export function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
        confidence n/a
      </span>
    );
  }
  const pct = Math.round(value * 100);
  const tone =
    value >= BATCH_CONFIDENCE_THRESHOLD
      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${tone}`}
      title="AI confidence — advisory only; your approval is what makes the grade real"
    >
      {pct}% confidence
    </span>
  );
}

const ROUTE_META: Record<ApprovalRoute, { label: string; tone: string }> = {
  batch: {
    label: 'Batch-eligible',
    tone: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  },
  individual: {
    label: 'Individual review',
    tone: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  },
  manual: {
    label: 'Manual review',
    tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  parent_only: {
    label: 'Needs adult · no number',
    tone: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  },
};

export function RouteBadge({ route }: { route: ApprovalRoute }) {
  const meta = ROUTE_META[route];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.tone}`}>
      {meta.label}
    </span>
  );
}

const CLASS_LABELS: Record<AssessabilityClass, string> = {
  'objective-autoscorable': 'Objective',
  'subjective-rubric': 'Subjective (rubric)',
  'not-assessable-needs-adult': 'Not AI-assessable',
};

export function AssessabilityBadge({ value }: { value: AssessabilityClass }) {
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      {CLASS_LABELS[value]}
    </span>
  );
}

/** Assistance context — disclosed, never auto-penalized (§8). */
export function AssistanceBadge({
  supportEventCount,
  usedAICount,
  hardStopCount,
}: {
  supportEventCount: number;
  usedAICount: number;
  hardStopCount: number;
}) {
  if (supportEventCount === 0) {
    return <span className="text-xs text-neutral-400">No assistance logged</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      {supportEventCount} support event{supportEventCount === 1 ? '' : 's'}
      {usedAICount > 0 ? ` · ${usedAICount} AI` : ''}
      {hardStopCount > 0 ? ` · ${hardStopCount} hard-stop` : ''}
    </span>
  );
}
