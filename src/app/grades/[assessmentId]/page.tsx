// Review one AI assessment before the parent grade gate (module E). Server
// component: renders the full mandatory disclosure envelope (§8) — suggested
// score + rationale, confidence, uncertainty/unread portions, assistance
// context, evidence examined, AI provenance — plus the prior grade for
// suggested-vs-final context, then the accept/override controls.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAssessmentDetail } from '../data';
import {
  AssessabilityBadge,
  AssistanceBadge,
  ConfidenceBadge,
  RouteBadge,
  ScoreBadge,
} from '../_components/badges';
import { GradeReviewActions } from '../_components/GradeReviewActions';

export const dynamic = 'force-dynamic';

export default async function GradeReviewPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  const detail = await getAssessmentDetail(assessmentId);
  if (!detail) notFound();

  const { assessment, route, routeReason, priorFinalScore } = detail;
  const env = assessment.envelope;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/grades"
          className="text-sm text-blue-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          ← Back to grade approvals
        </Link>
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">
            Student {assessment.studentId} · assignment {assessment.assignmentId}
          </h1>
          <RouteBadge route={route} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <AssessabilityBadge value={assessment.assessabilityClass} />
          <ScoreBadge value={env.suggestedScore} label="AI suggests" />
          <ConfidenceBadge value={env.confidence} />
          {priorFinalScore !== null ? (
            <ScoreBadge value={priorFinalScore} label="current grade" />
          ) : null}
        </div>
        <p className="text-xs text-neutral-400">Routing: {routeReason}</p>
      </header>

      {/* Disclosure envelope (§8) — exactly what the advisory suggestion rests on. */}
      <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          What the AI saw
        </h2>

        <Field label="Rationale">
          <p className="text-sm">{env.rationale || <Muted>No rationale provided.</Muted>}</p>
        </Field>

        <Field label="Uncertainty / unread portions">
          {env.uncertainty === null ? (
            <Muted>Uncertainty could not be established — this needs an adult.</Muted>
          ) : env.uncertainty.unreadPortions.length === 0 ? (
            <Muted>Nothing flagged as unread.</Muted>
          ) : (
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              {env.uncertainty.unreadPortions.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
              {env.uncertainty.notes ? (
                <li className="text-neutral-500">{env.uncertainty.notes}</li>
              ) : null}
            </ul>
          )}
        </Field>

        <Field label="Assistance (disclosed, never auto-penalized)">
          <AssistanceBadge
            supportEventCount={env.assistance.supportEventCount}
            usedAICount={env.assistance.usedAICount}
            hardStopCount={env.assistance.hardStopCount}
          />
        </Field>

        <Field label="Evidence examined">
          {env.evidenceExamined.length === 0 ? (
            <Muted>No evidence ids recorded.</Muted>
          ) : (
            <p className="text-sm tabular-nums text-neutral-600 dark:text-neutral-300">
              {env.evidenceExamined.join(', ')}
            </p>
          )}
        </Field>

        {assessment.aiProvenance ? (
          <Field label="AI provenance">
            <p className="text-xs text-neutral-500">
              {assessment.aiProvenance.vendor} · {assessment.aiProvenance.model} ·{' '}
              {assessment.aiProvenance.feature}
            </p>
          </Field>
        ) : null}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <GradeReviewActions assessmentId={assessmentId} suggestedScore={env.suggestedScore} />
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-sm text-neutral-400">{children}</span>;
}
