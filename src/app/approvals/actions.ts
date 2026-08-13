'use server';

// Server Actions for the parent curriculum-approval gate (module B).
//
// Each action is an untrusted POST entry point (see the Next "Security" guide):
// it takes only a *reference* (the import id) from the form, derives the
// principal from the session, and defers every authority decision to the domain
// operations, which call server-side `authorize()` before touching data. Return
// values are shaped to `{ ok, error }` for the UI — never raw records.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSession } from '../../lib/auth/session';
import {
  approveImport,
  requestCorrection,
  rejectImport,
} from '../../modules/ingestion/approve';
import { listPendingApprovals } from './data';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function importIdOf(formData: FormData): string {
  const id = formData.get('importId');
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('missing importId');
  }
  return id;
}

/** Human-safe message; the raw error stays server-side. */
function fail(error: unknown): ActionResult {
  const message =
    error instanceof Error && /authorization|not batch|transition|not found|unknown/i.test(error.message)
      ? error.message
      : 'Something went wrong. Please try again.';
  return { ok: false, error: message };
}

/** Approve one draft → materializes a Course, then returns to the queue. */
export async function approveAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const importId = importIdOf(formData);
  const { uid, householdId } = await requireSession();
  try {
    await approveImport({ uid, householdId, importId });
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/approvals');
  redirect('/approvals'); // throws control-flow; nothing after runs
}

/** Send a draft back for correction (re-upload / re-extract). */
export async function correctAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const importId = importIdOf(formData);
  const { uid, householdId } = await requireSession();
  try {
    await requestCorrection({ uid, householdId, importId });
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/approvals');
  redirect('/approvals');
}

/** Reject a draft outright (terminal). */
export async function rejectAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const importId = importIdOf(formData);
  const { uid, householdId } = await requireSession();
  try {
    await rejectImport({ uid, householdId, importId });
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/approvals');
  redirect('/approvals');
}

/**
 * Approve every batch-eligible draft in one pass. Re-derives eligibility
 * server-side (the client never asserts which are eligible) and approves each
 * with `batch: true`, which the domain layer re-checks against the policy. A
 * per-item failure is collected, not silently swallowed.
 */
export async function batchApproveAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState passes prev state positionally; this action ignores it
  _prev: ActionResult,
): Promise<ActionResult> {
  const { uid, householdId } = await requireSession();
  let approved = 0;
  const failures: string[] = [];
  try {
    const pending = await listPendingApprovals();
    const eligible = pending.filter((p) => p.batchEligible);
    for (const p of eligible) {
      try {
        await approveImport({ uid, householdId, importId: p.importId, batch: true });
        approved += 1;
      } catch {
        failures.push(p.courseTitle);
      }
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/approvals');
  if (failures.length > 0) {
    return {
      ok: false,
      error: `Approved ${approved}. Could not batch-approve: ${failures.join(', ')} — review individually.`,
    };
  }
  return { ok: true };
}
