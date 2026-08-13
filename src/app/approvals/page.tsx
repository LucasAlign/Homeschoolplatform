// Parent curriculum-approval queue (module B) — the list of extracted drafts
// awaiting the parent gate. Server component: it reads through the authorized
// data layer, groups by batch-eligibility, and links each row to its review.

import Link from 'next/link';
import { listPendingApprovals, type PendingApproval } from './data';
import {
  ConfidenceBadge,
  EligibilityBadge,
  MaterialRoleBadge,
} from './_components/badges';
import { BatchApproveButton } from './_components/BatchApproveButton';

export const dynamic = 'force-dynamic'; // always reflect the live queue

type LoadResult =
  | { ok: true; rows: PendingApproval[] }
  | { ok: false; message: string };

async function load(): Promise<LoadResult> {
  try {
    return { ok: true, rows: await listPendingApprovals() };
  } catch (e) {
    // No seeded dev household / emulator not running / not yet authorized.
    const message =
      e instanceof Error && /authorization|member/i.test(e.message)
        ? 'No household is connected for this dev session yet. Seed the emulator (npm run emulators:seed) or sign in once real auth lands.'
        : 'Could not load the approval queue. Is the Firestore emulator running?';
    return { ok: false, message };
  }
}

export default async function ApprovalsPage() {
  const result = await load();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Curriculum approvals</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Extracted drafts are advisory. Nothing reaches your students until you approve it.
          </p>
        </div>
        {result.ok ? (
          <BatchApproveButton count={result.rows.filter((r) => r.batchEligible).length} />
        ) : null}
      </header>

      {!result.ok ? (
        <EmptyState message={result.message} tone="error" />
      ) : result.rows.length === 0 ? (
        <EmptyState
          message="Nothing waiting for approval. New curriculum imports show up here once extraction finishes."
          tone="calm"
        />
      ) : (
        <ul className="space-y-3">
          {result.rows.map((row) => (
            <li key={row.importId}>
              <Link
                href={`/approvals/${row.importId}`}
                className="block rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{row.courseTitle}</span>
                  <EligibilityBadge eligible={row.batchEligible} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                  <MaterialRoleBadge role={row.materialRole} />
                  <ConfidenceBadge value={row.overallConfidence} />
                  <span className="tabular-nums">
                    {row.lessonCount} lessons · {row.assignmentCount} assignments
                  </span>
                  {row.qualityFlagCount > 0 ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      {row.qualityFlagCount} quality flag{row.qualityFlagCount === 1 ? '' : 's'}
                    </span>
                  ) : null}
                  {!row.internallyConsistent ? (
                    <span className="text-amber-700 dark:text-amber-400">inconsistent</span>
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
  return (
    <div className={`rounded-xl border border-dashed p-6 text-sm ${cls}`}>{message}</div>
  );
}
