'use client';

// The parent grade gate on the review screen. Two decisions, one form:
//   • Accept the AI suggestion as the final score (mode=accept)
//   • Approve with the parent's own final score (mode=score) — an override when
//     it diverges from the suggestion; the divergence is retained server-side.
// A not-assessable assessment carries no suggestion, so only the score path is
// offered. Bound to approveGradeAction via useActionState for pending + error.

import { useActionState, useState } from 'react';
import { approveGradeAction, type ActionResult } from '../actions';

const INITIAL: ActionResult = { ok: true };

export function GradeReviewActions({
  assessmentId,
  suggestedScore,
}: {
  assessmentId: string;
  /** 0–1 AI suggestion, or null when not-assessable. */
  suggestedScore: number | null;
}) {
  const [state, dispatch, pending] = useActionState(approveGradeAction, INITIAL);
  const suggestedPct = suggestedScore === null ? '' : String(Math.round(suggestedScore * 100));
  const [scorePct, setScorePct] = useState(suggestedPct);

  const entered = Number(scorePct);
  const validEntered = scorePct !== '' && Number.isFinite(entered) && entered >= 0 && entered <= 100;
  const suggestedPctNum = suggestedScore === null ? null : Math.round(suggestedScore * 100);
  const delta =
    validEntered && suggestedPctNum !== null ? entered - suggestedPctNum : null;

  return (
    <form action={dispatch} className="space-y-4">
      <input type="hidden" name="assessmentId" value={assessmentId} />

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            Final score (0–100)
          </span>
          <input
            type="number"
            name="finalScorePct"
            min={0}
            max={100}
            inputMode="numeric"
            value={scorePct}
            onChange={(e) => setScorePct(e.target.value)}
            className="w-28 rounded-lg border border-neutral-300 px-3 py-2 tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-700 dark:bg-neutral-900"
            placeholder="—"
          />
        </label>

        {delta !== null && delta !== 0 ? (
          <span className="pb-2 text-sm text-amber-700 dark:text-amber-400">
            {delta > 0 ? '+' : ''}
            {delta} vs AI suggestion — recorded as a parent override
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {suggestedScore !== null ? (
          <button
            type="submit"
            name="mode"
            value="accept"
            disabled={pending}
            className="rounded-lg border border-green-600 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-950"
          >
            {pending ? 'Working…' : `Accept AI suggestion (${suggestedPctNum}%)`}
          </button>
        ) : null}

        <button
          type="submit"
          name="mode"
          value="score"
          disabled={pending || !validEntered}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-50"
        >
          {pending ? 'Approving…' : 'Approve with this score'}
        </button>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <p className="text-xs text-neutral-400">
        Approving is the parent gate: the AI assessment is advisory until you accept or override it.
        Only then does it become an immutable Official Grade — and your student always sees
        suggested-vs-final.
      </p>
    </form>
  );
}
