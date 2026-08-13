'use client';

// "Approve all N ready" control on the queue. Eligibility is re-derived
// server-side inside the action (batchApproveAction) — this button only asks
// for the pass and surfaces the result; it never asserts which drafts qualify.

import { useActionState } from 'react';
import { batchApproveAction, type ActionResult } from '../actions';

const INITIAL: ActionResult = { ok: true };

export function BatchApproveButton({ count }: { count: number }) {
  const [state, run, pending] = useActionState(batchApproveAction, INITIAL);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={run}>
        <button
          type="submit"
          disabled={pending || count === 0}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-50"
        >
          {pending ? 'Approving…' : `Approve all ${count} ready`}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
