'use client';

// The parent plan gate on the review screen: approve the proposal into a new
// immutable Plan Revision. Bound to approveProposalAction via useActionState for
// pending + error (e.g. a stale-proposal rejection). Disabled when the proposal
// has already been superseded.

import { useActionState } from 'react';
import { approveProposalAction, type ActionResult } from '../actions';

const INITIAL: ActionResult = { ok: true };

export function ApprovePlanButton({
  proposalId,
  stale,
}: {
  proposalId: string;
  stale: boolean;
}) {
  const [state, dispatch, pending] = useActionState(approveProposalAction, INITIAL);

  if (stale) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        This proposal was superseded by a newer plan revision, so it can no longer be approved.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <form action={dispatch}>
        <input type="hidden" name="proposalId" value={proposalId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-50"
        >
          {pending ? 'Approving…' : 'Approve & set as current plan'}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <p className="text-xs text-neutral-400">
        Approving is the parent gate: this advisory schedule becomes an immutable, effective-dated
        Plan Revision and the student&apos;s current plan. Corrections supersede — revisions are never
        edited in place.
      </p>
    </div>
  );
}
