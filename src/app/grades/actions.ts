'use server';

// Server Actions for the parent grade-approval gate (module E).
//
// Each action is an untrusted POST entry point: it takes only a *reference* (the
// assessment id) plus the parent's decision from the form, derives the principal
// from the session, and defers every authority check to `approveAssessment`,
// which calls server-side `authorize()` and re-derives batch-eligibility. Returns
// are shaped to `{ ok, error }` — never raw records.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSession } from '../../lib/auth/session';
import { approveAssessment } from '../../modules/assessment/grading';
import { listPendingAssessments } from './data';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function assessmentIdOf(formData: FormData): string {
  const id = formData.get('assessmentId');
  if (typeof id !== 'string' || id.length === 0) throw new Error('missing assessmentId');
  return id;
}

/** Parse the parent's final score (a 0–100 percentage in the form) into a 0–1 score. */
function parseFinalScore(formData: FormData): number {
  const raw = formData.get('finalScorePct');
  const pct = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error('a final score between 0 and 100 is required');
  }
  return pct / 100;
}

function fail(error: unknown): ActionResult {
  const known =
    error instanceof Error &&
    /authorization|not batch|not assessmentready|already approved|final score|unknown|required/i.test(
      error.message,
    );
  return { ok: false, error: known ? (error as Error).message : 'Something went wrong. Please try again.' };
}

/**
 * Approve one assessment into an immutable Official Grade. `mode=accept` takes
 * the AI suggestion as the final score; `mode=score` uses the parent's entered
 * value (an override when it diverges — the divergence is retained server-side).
 */
export async function approveGradeAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const assessmentId = assessmentIdOf(formData);
  const mode = formData.get('mode');
  const { uid, householdId } = await requireSession();

  let finalScore: number | undefined;
  try {
    if (mode === 'score') finalScore = parseFinalScore(formData);
    else if (mode !== 'accept') throw new Error('invalid approval mode');
  } catch (e) {
    return fail(e);
  }

  try {
    await approveAssessment({ uid, householdId, assessmentId, finalScore });
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/grades');
  redirect('/grades'); // throws control-flow; nothing after runs
}

/**
 * Approve every batch-eligible assessment, accepting each AI suggestion. Batch
 * eligibility is re-derived server-side (both here for the pass and inside
 * `approveAssessment` with `batch: true`); the client never asserts it. A
 * per-item failure is collected, not swallowed.
 */
export async function batchApproveGradesAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState passes prev state positionally; this action ignores it
  _prev: ActionResult,
): Promise<ActionResult> {
  const { uid, householdId } = await requireSession();
  let approved = 0;
  const failures: string[] = [];
  try {
    const pending = await listPendingAssessments();
    const eligible = pending.filter((p) => p.batchEligible);
    for (const p of eligible) {
      try {
        await approveAssessment({ uid, householdId, assessmentId: p.assessmentId, batch: true });
        approved += 1;
      } catch {
        failures.push(p.assessmentId);
      }
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/grades');
  if (failures.length > 0) {
    return {
      ok: false,
      error: `Approved ${approved}. Could not batch-approve ${failures.length} — review individually.`,
    };
  }
  return { ok: true };
}
