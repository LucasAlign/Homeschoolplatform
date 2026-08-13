// Review one extracted draft before the parent gate (module B). Server
// component: renders the draft tree (lessons → assignments) with per-item
// confidence and source-page provenance, the quality flags, and the
// Approve / Request correction / Reject controls.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getApprovalDetail } from '../data';
import {
  ConfidenceBadge,
  EligibilityBadge,
  MaterialRoleBadge,
  QualityFlagList,
} from '../_components/badges';
import { ReviewActions } from '../_components/ReviewActions';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const { importId } = await params;
  const detail = await getApprovalDetail(importId);
  if (!detail) notFound();

  const { draft, job, batchEligible } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/approvals"
          className="text-sm text-blue-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          ← Back to approvals
        </Link>
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{draft.courseTitle}</h1>
          <EligibilityBadge eligible={batchEligible} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <MaterialRoleBadge role={job.materialRole} />
          <ConfidenceBadge value={draft.overallConfidence} />
          <span>
            {draft.internallyConsistent ? 'Internally consistent' : 'Flagged as inconsistent'}
          </span>
        </div>
        <div>
          <QualityFlagList flags={draft.qualityFlags} />
        </div>
      </header>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Extracted structure
        </h2>
        <ol className="space-y-4">
          {draft.lessons
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((lesson) => (
              <li key={`${lesson.order}-${lesson.title}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {lesson.order}. {lesson.title}
                  </span>
                  <ConfidenceBadge value={lesson.confidence} />
                </div>
                {lesson.assignments.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 border-l border-neutral-200 pl-4 dark:border-neutral-800">
                    {lesson.assignments.map((a, i) => (
                      <li
                        key={`${a.title}-${i}`}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <span>{a.title}</span>
                        <ConfidenceBadge value={a.confidence} />
                        <span className="text-xs text-neutral-400">
                          source p.{a.provenance.sourcePage}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 pl-4 text-xs text-neutral-400">No assignments extracted.</p>
                )}
              </li>
            ))}
        </ol>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <ReviewActions importId={importId} />
      </section>
    </div>
  );
}
