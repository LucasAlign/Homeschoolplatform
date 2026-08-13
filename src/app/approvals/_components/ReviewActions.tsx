'use client';

// The three parent-gate controls on the review screen: Approve, Request
// correction, Reject. Each is its own form bound to a Server Action via
// useActionState, so we get per-action pending + error state. Reject is
// destructive (terminal), so it asks for confirmation before it POSTs.

import { useActionState } from 'react';
import { approveAction, correctAction, rejectAction, type ActionResult } from '../actions';

const INITIAL: ActionResult = { ok: true };

export function ReviewActions({ importId }: { importId: string }) {
  const [approveState, approve, approving] = useActionState(approveAction, INITIAL);
  const [correctState, correct, correcting] = useActionState(correctAction, INITIAL);
  const [rejectState, reject, rejecting] = useActionState(rejectAction, INITIAL);

  const busy = approving || correcting || rejecting;
  const error = approveState.error ?? correctState.error ?? rejectState.error;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <form action={approve}>
          <input type="hidden" name="importId" value={importId} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-50"
          >
            {approving ? 'Approving…' : 'Approve & create course'}
          </button>
        </form>

        <form action={correct}>
          <input type="hidden" name="importId" value={importId} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {correcting ? 'Sending…' : 'Request correction'}
          </button>
        </form>

        <form
          action={reject}
          onSubmit={(e) => {
            if (!window.confirm('Reject this draft? This cannot be undone.')) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="importId" value={importId} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            {rejecting ? 'Rejecting…' : 'Reject'}
          </button>
        </form>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-neutral-400">
        Approving is the parent gate: the extraction is advisory until you accept it. Only then does
        it become a real course your students see.
      </p>
    </div>
  );
}
