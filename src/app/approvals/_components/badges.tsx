// Pure presentational badges for the approval surface. Server components — no
// interactivity, safe to render on the server.

import { BATCH_CONFIDENCE_THRESHOLD } from '../../../modules/ingestion/approval-policy';
import type { MaterialRole, QualityFlag } from '../../../modules/ingestion/types';

export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone =
    value >= BATCH_CONFIDENCE_THRESHOLD
      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
      : value >= 0.6
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${tone}`}
      title="Extraction confidence — advisory only; your approval is what makes it real"
    >
      {pct}% confidence
    </span>
  );
}

const ROLE_LABELS: Record<MaterialRole, string> = {
  student: 'Student material',
  answer_key: 'Answer key',
  teacher_guide: 'Teacher guide',
  mixed: 'Mixed — needs split',
};

export function MaterialRoleBadge({ role }: { role: MaterialRole }) {
  const adultOnly = role === 'answer_key' || role === 'teacher_guide';
  const tone = adultOnly
    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
    : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

const FLAG_LABELS: Record<QualityFlag['kind'], string> = {
  blur: 'Blurry page',
  glare: 'Glare',
  cutoff: 'Cut-off content',
  noise: 'Noisy scan',
  low_confidence: 'Low confidence',
  rotation: 'Rotated page',
};

export function QualityFlagList({ flags }: { flags: QualityFlag[] }) {
  if (flags.length === 0) {
    return <span className="text-xs text-neutral-400">No quality issues detected</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {flags.map((f, i) => (
        <li
          key={`${f.kind}-${f.page}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        >
          <span aria-hidden>⚠</span>
          {FLAG_LABELS[f.kind]} · p.{f.page}
        </li>
      ))}
    </ul>
  );
}

/** Green "ready to batch-approve" vs amber "needs individual review" pill. */
export function EligibilityBadge({ eligible }: { eligible: boolean }) {
  return eligible ? (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
      Ready to batch-approve
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      Needs individual review
    </span>
  );
}
