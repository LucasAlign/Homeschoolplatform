// Parent grade-approval queue (module E) — AssessmentReady assessments awaiting
// the parent gate. Server component: reads through the authorized data layer and
// links each row to its review screen.

import Link from 'next/link';
import { listPendingAssessments, type PendingAssessment } from './data';
import {
  AssessabilityBadge,
  AssistanceBadge,
  ConfidenceBadge,
  RouteBadge,
  ScoreBadge,
} from './_components/badges';
import { BatchApproveGradesButton } from './_components/BatchApproveGradesButton';

export const dynamic = 'force-dynamic';

type LoadResult =
  | { ok: true; rows: PendingAssessment[] }
  | { ok: false; message: string };

async function load(): Promise<LoadResult> {
  try {
    return { ok: true, rows: await listPendingAssessments() };
  } catch (e) {
    const message =
      e instanceof Error && /authorization|member/i.test(e.message)
        ? 'No household is connected for this dev session yet. Seed the emulator (npm run emulators:seed) or sign in once real auth lands.'
        : 'Could not load the grade queue. Is the Firestore emulator running?';
    return { ok: false, message };
  }
}

export default async function GradesPage() {
  const result = await load();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Grade approvals</h1>
          <p className="mt-1 text-sm text-neutral-500">
            AI assessments are advisory. No grade is recorded until you accept or override it.
          </p>
        </div>
        {result.ok ? (
          <BatchApproveGradesButton count={result.rows.filter((r) => r.batchEligible).length} />
        ) : null}
      </header>

      {!result.ok ? (
        <EmptyState message={result.message} tone="error" />
      ) : result.rows.length === 0 ? (
        <EmptyState
          message="Nothing waiting to grade. Assessments show up here once a submission has been AI-assessed."
          tone="calm"
        />
      ) : (
        <ul className="space-y-3">
          {result.rows.map((row) => (
            <li key={row.assessmentId}>
              <Link
                href={`/grades/${row.assessmentId}`}
                className="block rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    Student {row.studentId} · assignment {row.assignmentId}
                  </span>
                  <RouteBadge route={row.route} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                  <AssessabilityBadge value={row.assessabilityClass} />
                  <ScoreBadge value={row.suggestedScore} label="AI suggests" />
                  <ConfidenceBadge value={row.confidence} />
                  <AssistanceBadge
                    supportEventCount={row.supportEventCount}
                    usedAICount={row.usedAICount}
                    hardStopCount={row.hardStopCount}
                  />
                  {row.hasUncertainty ? (
                    <span className="text-amber-700 dark:text-amber-400">unread portions</span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ message, tone }: { message: string; tone: 'calm' | 'error' }) {
  const cls =
    tone === 'error'
      ? 'border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300'
      : 'border-neutral-300 text-neutral-500 dark:border-neutral-700';
  return <div className={`rounded-xl border border-dashed p-6 text-sm ${cls}`}>{message}</div>;
}
