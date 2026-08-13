// Server data-access for the parent plan-approval queue (module C).
//
// Reads run through the Admin SDK (bypasses Firestore rules), so every read
// first calls `authorize()` for `plan` read — the same fail-closed gate the
// approval path uses (invariant 3). The client only supplies a proposal id; the
// household and everything else are re-derived from the session.
//
// "Pending" has no status field in module C: a ProposedSchedule is actionable
// iff it is NOT stale — i.e. its `basedOnRevisionId` still equals the plan's
// current revision (optimistic concurrency, issue #6). Approving one advances the
// plan pointer, which makes it and any sibling proposals stale, so they drop off
// the queue. A stale proposal cannot be approved (the domain throws), so we hide
// it here and explain it on the detail screen.

import { adminDb } from '../../lib/firebase/admin';
import { authorize } from '../../modules/identity/authorize';
import { dailyWorkload, isStaleProposal } from '../../modules/planning/scheduling-logic';
import type {
  ApprovedPlan,
  PlanRevision,
  PlanScope,
  ProposedSchedule,
  ScheduledAssignment,
} from '../../modules/planning/types';
import { requireSession } from '../../lib/auth/session';

// Mirrors the (unexported) scopeKey in planning.ts — keep in sync.
function scopeKey(scope: PlanScope): string {
  return `${scope.studentId}__${scope.schoolYearId}`;
}

function proposalsCol(hid: string) {
  return adminDb.collection(`households/${hid}/proposals`);
}
function planRef(hid: string, scope: PlanScope) {
  return adminDb.doc(`households/${hid}/plans/${scopeKey(scope)}`);
}
function revisionRef(hid: string, revisionId: string) {
  return adminDb.doc(`households/${hid}/planRevisions/${revisionId}`);
}

async function planForScope(hid: string, scope: PlanScope): Promise<ApprovedPlan | null> {
  const snap = await planRef(hid, scope).get();
  return snap.exists ? (snap.data() as ApprovedPlan) : null;
}

export interface PendingProposal {
  proposalId: string;
  studentId: string;
  schoolYearId: string;
  kind: ProposedSchedule['kind'];
  placementCount: number;
  /** Revision this proposal builds on (0 = a brand-new plan). */
  basedOnRevisionNumber: number;
  createdAt: number;
}

export interface DayWorkload {
  date: string;
  total: number;
}

export interface PlacementDiff {
  moved: { assignmentId: string; courseId: string; fromDate: string; toDate: string }[];
  added: ScheduledAssignment[];
  removed: ScheduledAssignment[];
}

export interface ProposalDetail {
  proposalId: string;
  scope: PlanScope;
  kind: ProposedSchedule['kind'];
  placements: ScheduledAssignment[]; // sorted by (date, order)
  perDay: DayWorkload[];
  basedOnRevisionNumber: number;
  baselineExists: boolean;
  diff: PlacementDiff | null; // null when there is no baseline (first plan)
  stale: boolean; // superseded since it was proposed — cannot be approved
}

function sortPlacements(p: ScheduledAssignment[]): ScheduledAssignment[] {
  return [...p].sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));
}

function perDayWorkload(placements: ScheduledAssignment[]): DayWorkload[] {
  const days = [...new Set(placements.map((p) => p.date))].sort();
  return days.map((date) => ({ date, total: dailyWorkload(placements, date) }));
}

function diffPlacements(
  baseline: ScheduledAssignment[],
  proposed: ScheduledAssignment[],
): PlacementDiff {
  const baseById = new Map(baseline.map((p) => [p.assignmentId, p]));
  const propById = new Map(proposed.map((p) => [p.assignmentId, p]));
  const moved: PlacementDiff['moved'] = [];
  const added: ScheduledAssignment[] = [];
  for (const p of proposed) {
    const b = baseById.get(p.assignmentId);
    if (!b) added.push(p);
    else if (b.date !== p.date) {
      moved.push({ assignmentId: p.assignmentId, courseId: p.courseId, fromDate: b.date, toDate: p.date });
    }
  }
  const removed = baseline.filter((b) => !propById.has(b.assignmentId));
  return { moved, added, removed };
}

/** Non-stale proposals across all scopes, newest first. */
export async function listPendingProposals(): Promise<PendingProposal[]> {
  const { uid, householdId } = await requireSession();
  await authorize({ uid, householdId, record: 'plan', action: 'read' });

  const snap = await proposalsCol(householdId).get();
  const rows: PendingProposal[] = [];
  for (const d of snap.docs) {
    const proposal = d.data() as ProposedSchedule;
    const plan = await planForScope(householdId, proposal.scope);
    if (isStaleProposal(proposal, plan?.currentRevisionId ?? null)) continue;
    rows.push({
      proposalId: proposal.id,
      studentId: proposal.scope.studentId,
      schoolYearId: proposal.scope.schoolYearId,
      kind: proposal.kind,
      placementCount: proposal.placements.length,
      basedOnRevisionNumber: plan?.currentRevisionNumber ?? 0,
      createdAt: proposal.createdAt,
    });
  }
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows;
}

/** Detail for one proposal (including the diff vs the current revision), or null if unknown. */
export async function getProposalDetail(proposalId: string): Promise<ProposalDetail | null> {
  const { uid, householdId } = await requireSession();
  await authorize({ uid, householdId, record: 'plan', action: 'read' });

  const snap = await proposalsCol(householdId).doc(proposalId).get();
  if (!snap.exists) return null;
  const proposal = snap.data() as ProposedSchedule;

  const plan = await planForScope(householdId, proposal.scope);
  const stale = isStaleProposal(proposal, plan?.currentRevisionId ?? null);

  let baseline: ScheduledAssignment[] | null = null;
  if (plan?.currentRevisionId) {
    const revSnap = await revisionRef(householdId, plan.currentRevisionId).get();
    if (revSnap.exists) baseline = (revSnap.data() as PlanRevision).placements;
  }

  return {
    proposalId: proposal.id,
    scope: proposal.scope,
    kind: proposal.kind,
    placements: sortPlacements(proposal.placements),
    perDay: perDayWorkload(proposal.placements),
    basedOnRevisionNumber: plan?.currentRevisionNumber ?? 0,
    baselineExists: baseline !== null,
    diff: baseline ? diffPlacements(baseline, proposal.placements) : null,
    stale,
  };
}
