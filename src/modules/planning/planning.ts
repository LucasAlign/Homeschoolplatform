// Module C — planning operations (server-only, Admin SDK).
//
// Approval materializes exactly one immutable, effective-dated Plan Revision
// and advances the Approved Plan pointer under optimistic concurrency. Student
// deferral never mutates the Approved Plan: it validates against policy and
// yields a revised Proposed Schedule, auto-applying only within pre-authorized
// reflow bounds (issue #6).

import { adminDb, FieldValue } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { recordAudit } from '../audit/audit';
import {
  isStaleProposal,
  isWithinAutoReflowBounds,
  resolveDeferralPolicy,
  validateDeferral,
} from './scheduling-logic';
import type {
  ApprovedPlan,
  DeferralPolicyConfig,
  PlanRevision,
  PlanScope,
  ProposedSchedule,
  ScheduledAssignment,
} from './types';

export class PlanningError extends Error {
  constructor(reason: string) {
    super(`planning: ${reason}`);
    this.name = 'PlanningError';
  }
}

function scopeKey(scope: PlanScope): string {
  return `${scope.studentId}__${scope.schoolYearId}`;
}
function planRef(hid: string, scope: PlanScope) {
  return adminDb.doc(`households/${hid}/plans/${scopeKey(scope)}`);
}
function proposalRef(hid: string, id: string) {
  return adminDb.doc(`households/${hid}/proposals/${id}`);
}
function revisionsCol(hid: string) {
  return adminDb.collection(`households/${hid}/planRevisions`);
}

async function currentPlan(hid: string, scope: PlanScope): Promise<ApprovedPlan | null> {
  const snap = await planRef(hid, scope).get();
  return snap.exists ? (snap.data() as ApprovedPlan) : null;
}

export async function proposeSchedule(args: {
  uid: string;
  householdId: string;
  scope: PlanScope;
  kind: 'full' | 'change_set';
  placements: ScheduledAssignment[];
}): Promise<ProposedSchedule> {
  await authorize({ uid: args.uid, householdId: args.householdId, record: 'plan', action: 'write' });
  const current = await currentPlan(args.householdId, args.scope);
  const ref = adminDb.collection(`households/${args.householdId}/proposals`).doc();
  const proposal: ProposedSchedule = {
    id: ref.id,
    scope: args.scope,
    kind: args.kind,
    placements: args.placements,
    basedOnRevisionId: current?.currentRevisionId ?? null,
    advisory: true,
    createdAt: Date.now(),
  };
  await ref.set(proposal);
  return proposal;
}

/**
 * Materialize a proposal into a new immutable Plan Revision under optimistic
 * concurrency. Internal: does NOT authorize — callers must gate access first
 * (parent approval, or the system applying a pre-authorized reflow).
 * `approvedByUid` records the approving authority.
 */
async function applyProposalAsRevision(
  householdId: string,
  proposalId: string,
  approvedByUid: string,
): Promise<PlanRevision> {
  return adminDb.runTransaction(async (tx) => {
    const pSnap = await tx.get(proposalRef(householdId, proposalId));
    if (!pSnap.exists) throw new PlanningError('unknown proposal');
    const proposal = pSnap.data() as ProposedSchedule;

    const planDoc = await tx.get(planRef(householdId, proposal.scope));
    const current = planDoc.exists ? (planDoc.data() as ApprovedPlan) : null;

    if (isStaleProposal(proposal, current?.currentRevisionId ?? null)) {
      throw new PlanningError('stale proposal; rebase against the current revision');
    }

    const revRef = revisionsCol(householdId).doc();
    const revision: PlanRevision = {
      id: revRef.id,
      scope: proposal.scope,
      revisionNumber: (current?.currentRevisionNumber ?? 0) + 1,
      effectiveDate: new Date().toISOString().slice(0, 10),
      placements: proposal.placements,
      supersedesRevisionId: current?.currentRevisionId ?? null,
      approvedByUid,
      createdAt: Date.now(),
    };
    tx.set(revRef, revision);
    tx.set(planRef(householdId, proposal.scope), {
      scope: proposal.scope,
      currentRevisionId: revRef.id,
      currentRevisionNumber: revision.revisionNumber,
      updatedAt: FieldValue.serverTimestamp(),
    } satisfies Omit<ApprovedPlan, 'updatedAt'> & { updatedAt: FieldValue });

    return revision;
  });
}

/**
 * Approve a proposal into a new immutable Plan Revision (Parent Admin+). Rejects
 * a stale proposal (optimistic concurrency) so it cannot overwrite a newer one.
 */
export async function approveProposal(args: {
  uid: string;
  householdId: string;
  proposalId: string;
}): Promise<PlanRevision> {
  await authorize({ uid: args.uid, householdId: args.householdId, record: 'plan', action: 'approve' });
  return applyProposalAsRevision(args.householdId, args.proposalId, args.uid);
}

/**
 * A Student defers an Assignment within policy. Produces a revised Proposed
 * Schedule; if the household pre-authorized bounded reflow and the change stays
 * within bounds, it auto-approves into a new revision. Never mutates an
 * existing revision.
 */
export async function studentDeferAssignment(args: {
  uid: string;
  householdId: string;
  scope: PlanScope;
  assignmentId: string;
  toDate: string;
  policyConfig: DeferralPolicyConfig;
}): Promise<{ autoApplied: boolean; proposalId?: string; revisionId?: string }> {
  // Confirms household membership + role (Students hold plan:read).
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'plan',
    action: 'read',
    studentId: args.scope.studentId,
  });

  const current = await currentPlan(args.householdId, args.scope);
  if (!current) throw new PlanningError('no approved plan for scope');
  const revSnap = await revisionsCol(args.householdId).doc(current.currentRevisionId).get();
  const revision = revSnap.data() as PlanRevision;

  const target = revision.placements.find((p) => p.assignmentId === args.assignmentId);
  if (!target) throw new PlanningError('assignment not in current plan');

  const policy = resolveDeferralPolicy(args.policyConfig, args.scope.studentId, target.courseId);
  const check = validateDeferral(policy, target, args.toDate);
  if (!check.ok) throw new PlanningError(check.reason ?? 'deferral not permitted');

  const after: ScheduledAssignment[] = revision.placements.map((p) =>
    p.assignmentId === args.assignmentId ? { ...p, date: args.toDate } : p,
  );

  const proposal = await proposeSchedule({
    uid: args.uid,
    householdId: args.householdId,
    scope: args.scope,
    kind: 'change_set',
    placements: after,
  });

  if (isWithinAutoReflowBounds(revision.placements, after, policy)) {
    // Pre-authorized reflow: the parent's standing authorization (policy) is the
    // approver, applied by the system — not the Student exercising approve.
    const rev = await applyProposalAsRevision(
      args.householdId,
      proposal.id,
      'system:auto-reflow',
    );
    await recordAudit({
      householdId: args.householdId,
      actorUid: args.uid,
      action: 'write',
      recordType: 'plan',
      recordId: rev.id,
      studentId: args.scope.studentId,
      detail: `student deferral auto-reflowed ${args.assignmentId} -> ${args.toDate}`,
    });
    return { autoApplied: true, revisionId: rev.id };
  }

  return { autoApplied: false, proposalId: proposal.id };
}
