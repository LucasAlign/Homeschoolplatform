'use server';

// Server Action for the parent plan-approval gate (module C).
//
// Untrusted POST entry point: takes only the proposal id, derives the principal
// from the session, and defers authority to `approveProposal`, which calls
// server-side `authorize()` (plan:approve) and enforces optimistic concurrency —
// a stale proposal is rejected so it can't overwrite a newer revision. There is
// deliberately NO reject action: module C has no reject op; a proposal a parent
// doesn't want simply goes stale when a different one is approved.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSession } from '../../lib/auth/session';
import { approveProposal } from '../../modules/planning/planning';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function approveProposalAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const proposalId = formData.get('proposalId');
  if (typeof proposalId !== 'string' || proposalId.length === 0) {
    return { ok: false, error: 'missing proposalId' };
  }
  const { uid, householdId } = await requireSession();
  try {
    await approveProposal({ uid, householdId, proposalId });
  } catch (e) {
    const known =
      e instanceof Error && /authorization|stale|unknown proposal/i.test(e.message);
    return {
      ok: false,
      error: known
        ? e instanceof Error && /stale/i.test(e.message)
          ? 'This proposal was superseded by a newer plan revision. Reload the queue.'
          : (e as Error).message
        : 'Something went wrong. Please try again.',
    };
  }
  revalidatePath('/plans');
  redirect('/plans'); // throws control-flow; nothing after runs
}
