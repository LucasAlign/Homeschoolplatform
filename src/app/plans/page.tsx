// Parent plan-approval queue (module C) — advisory Proposed Schedules awaiting
// the parent gate. Server component: reads through the authorized data layer,
// hides stale (superseded) proposals, and links each row to its review.

import Link from 'next/link';
import { listPendingProposals, type PendingProposal } from './data';
import { BasedOnBadge, KindBadge } from './_components/badges';

export const dynamic = 'force-dynamic';

type LoadResult =
  | { ok: true; rows: PendingProposal[] }
  | { ok: false; message: string };

async function load(): Promise<LoadResult> {
  try {
    return { ok: true, rows: await listPendingProposals() };
  } catch (e) {
    const message =
      e instanceof Error && /authorization|member/i.test(e.message)
        ? 'No household is connected for this dev session yet. Seed the emulator (npm run seed) or sign in once real auth lands.'
        : 'Could not load the plan queue. Is the Firestore emulator running?';
    return { ok: false, message };
  }
}

export default async function PlansPage() {
  const result = await load();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Plan approvals</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Proposed schedules are advisory. A student&apos;s plan only changes when you approve one
          into a revision.
        </p>
      </header>

      {!result.ok ? (
        <EmptyState message={result.message} tone="error" />
      ) : result.rows.length === 0 ? (
        <EmptyState
          message="No proposals waiting for approval. New schedules and student deferrals that need sign-off show up here."
          tone="calm"
        />
      ) : (
        <ul className="space-y-3">
          {result.rows.map((row) => (
            <li key={row.proposalId}>
              <Link
                href={`/plans/${row.proposalId}`}
                className="block rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    Student {row.studentId} · {row.schoolYearId}
                  </span>
                  <KindBadge kind={row.kind} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                  <BasedOnBadge revisionNumber={row.basedOnRevisionNumber} />
                  <span className="tabular-nums">{row.placementCount} placements</span>
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
