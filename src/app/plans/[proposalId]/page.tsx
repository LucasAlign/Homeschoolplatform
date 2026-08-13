// Review one Proposed Schedule before the parent gate (module C). Server
// component: shows the change set vs the current revision (for a change_set),
// the full proposed day-by-day schedule with per-day workload, then Approve.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProposalDetail } from '../data';
import { BasedOnBadge, DiffSummary, KindBadge } from '../_components/badges';
import { ApprovePlanButton } from '../_components/ApprovePlanButton';

export const dynamic = 'force-dynamic';

export default async function ProposalReviewPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = await params;
  const detail = await getProposalDetail(proposalId);
  if (!detail) notFound();

  const { scope, kind, placements, perDay, basedOnRevisionNumber, diff, stale } = detail;
  const byDate = new Map<string, typeof placements>();
  for (const p of placements) {
    const list = byDate.get(p.date) ?? [];
    list.push(p);
    byDate.set(p.date, list);
  }
  const workloadByDate = new Map(perDay.map((d) => [d.date, d.total]));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/plans"
          className="text-sm text-blue-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          ← Back to plan approvals
        </Link>
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">
            Student {scope.studentId} · {scope.schoolYearId}
          </h1>
          <KindBadge kind={kind} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <BasedOnBadge revisionNumber={basedOnRevisionNumber} />
          {diff ? (
            <DiffSummary moved={diff.moved.length} added={diff.added.length} removed={diff.removed.length} />
          ) : (
            <span className="text-xs text-neutral-400">Initial plan — no prior revision</span>
          )}
        </div>
      </header>

      {diff && (diff.moved.length > 0 || diff.added.length > 0 || diff.removed.length > 0) ? (
        <section className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Changes vs current plan
          </h2>
          <ul className="space-y-1 text-sm">
            {diff.moved.map((m) => (
              <li key={`m-${m.assignmentId}`} className="flex flex-wrap items-center gap-2">
                <span className="inline-flex w-16 justify-center rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  moved
                </span>
                <span className="tabular-nums">{m.assignmentId}</span>
                <span className="text-neutral-400 tabular-nums">
                  {m.fromDate} → {m.toDate}
                </span>
              </li>
            ))}
            {diff.added.map((a) => (
              <li key={`a-${a.assignmentId}`} className="flex flex-wrap items-center gap-2">
                <span className="inline-flex w-16 justify-center rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                  added
                </span>
                <span className="tabular-nums">{a.assignmentId}</span>
                <span className="text-neutral-400 tabular-nums">{a.date}</span>
              </li>
            ))}
            {diff.removed.map((r) => (
              <li key={`r-${r.assignmentId}`} className="flex flex-wrap items-center gap-2">
                <span className="inline-flex w-16 justify-center rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
                  removed
                </span>
                <span className="tabular-nums">{r.assignmentId}</span>
                <span className="text-neutral-400 tabular-nums">{r.date}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Proposed schedule
        </h2>
        <div className="space-y-4">
          {[...byDate.keys()].sort().map((date) => (
            <div key={date}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium tabular-nums">{date}</span>
                <span className="text-xs text-neutral-400 tabular-nums">
                  workload {workloadByDate.get(date) ?? 0}
                </span>
              </div>
              <ul className="space-y-1 border-l border-neutral-200 pl-4 dark:border-neutral-800">
                {(byDate.get(date) ?? []).map((p) => (
                  <li key={p.assignmentId} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="tabular-nums">{p.assignmentId}</span>
                    <span className="text-xs text-neutral-400">{p.courseId}</span>
                    {p.fixed ? (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
                        fixed
                      </span>
                    ) : null}
                    {!p.deferrable ? (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
                        non-deferrable
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <ApprovePlanButton proposalId={proposalId} stale={stale} />
      </section>
    </div>
  );
}
