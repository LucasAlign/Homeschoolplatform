// Module E — grade operations (server-only, Admin SDK).
//
// The parent-approval gate between an advisory AI Assessment and an immutable
// Official Grade (invariant 4): NO AI result becomes an Official Grade without a
// recorded adult approval. Approval is a parent-authority `approve` action;
// Students never grade or approve (invariant enforced by the capability matrix).
//
// Resubmission supersedes: a new approval for an Assignment+Student materializes
// a new immutable Official Grade pointing back at the prior (invariant 5). A
// parent may override the AI suggestion; the divergence is retained and the
// student always sees suggested-vs-final.

import { adminDb } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { recordAudit } from '../audit/audit';
import { isBatchApprovable, type RoutingInput } from './grade-routing';
import { computeDivergence, isLargeSwing, nextGradeChain, type PriorGradeRef } from './official-grade';
import type { AIAssessment, OfficialGrade, RoutingSignals } from './types';

export class GradingError extends Error {
  constructor(reason: string) {
    super(`grading: ${reason}`);
    this.name = 'GradingError';
  }
}

function assessmentRef(hid: string, aid: string) {
  return adminDb.doc(`households/${hid}/aiAssessments/${aid}`);
}
function gradesCol(hid: string) {
  return adminDb.collection(`households/${hid}/officialGrades`);
}

/** The current (highest-version) Official Grade for an Assignment+Student, if any. */
async function currentGrade(
  hid: string,
  assignmentId: string,
  studentId: string,
): Promise<PriorGradeRef | null> {
  const snap = await gradesCol(hid)
    .where('assignmentId', '==', assignmentId)
    .where('studentId', '==', studentId)
    .orderBy('version', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const g = snap.docs[0].data() as OfficialGrade;
  return { id: g.id, version: g.version, finalScore: g.finalScore };
}

/**
 * Approve one AI Assessment into an immutable Official Grade (Parent Admin+ /
 * Household Owner). `finalScore` is the parent's record-of-truth; omit it to
 * accept the AI suggestion. `batch: true` requires batch-eligibility (high-
 * confidence objective-autoscorable with no forcing signal).
 */
export async function approveAssessment(args: {
  uid: string;
  householdId: string;
  assessmentId: string;
  /** Parent's final score (record-of-truth). Defaults to the AI suggestion. */
  finalScore?: number;
  /** Signals that force manual review; largeSwing is computed if omitted. */
  signals?: Partial<RoutingSignals>;
  batch?: boolean;
}): Promise<OfficialGrade> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'official_grade',
    action: 'approve',
  });

  const aSnap = await assessmentRef(args.householdId, args.assessmentId).get();
  if (!aSnap.exists) throw new GradingError('unknown assessment');
  const assessment = aSnap.data() as AIAssessment;
  if (assessment.state !== 'AssessmentReady') {
    throw new GradingError('assessment is not AssessmentReady');
  }

  // One Official Grade per approval of a given assessment (idempotency guard).
  const already = await gradesCol(args.householdId)
    .where('sourceAssessmentId', '==', args.assessmentId)
    .limit(1)
    .get();
  if (!already.empty) throw new GradingError('assessment already approved into a grade');

  const prior = await currentGrade(args.householdId, assessment.assignmentId, assessment.studentId);
  const suggested = assessment.envelope.suggestedScore;

  // Resolve the final score: parent value, else accept the suggestion. A
  // not-assessable assessment (no suggestion) demands an explicit parent score.
  const finalScore = args.finalScore ?? suggested;
  if (finalScore === null || finalScore === undefined) {
    throw new GradingError('a final score is required (no AI suggestion to accept)');
  }

  // Batch approvals are only valid for batch-eligible assessments.
  const largeSwing = args.signals?.largeSwing ?? isLargeSwing(prior?.finalScore ?? null, suggested);
  const routing: RoutingInput = {
    assessabilityClass: assessment.assessabilityClass,
    confidence: assessment.envelope.confidence,
    signals: {
      transcribed: args.signals?.transcribed ?? false,
      flagged: args.signals?.flagged ?? false,
      missingEvidence: args.signals?.missingEvidence ?? false,
      largeSwing,
    },
  };
  if (args.batch && !isBatchApprovable(routing)) {
    throw new GradingError('assessment is not batch-eligible; individual review required');
  }

  const chain = nextGradeChain(prior);
  const divergence = computeDivergence(suggested, finalScore);

  const ref = gradesCol(args.householdId).doc();
  const grade: OfficialGrade = {
    id: ref.id,
    assignmentId: assessment.assignmentId,
    studentId: assessment.studentId,
    submissionId: assessment.submissionId,
    sourceAssessmentId: assessment.id,
    version: chain.version,
    supersedesGradeId: chain.supersedesGradeId,
    suggestedScore: suggested,
    finalScore,
    parentOverride: divergence.overridden,
    approvedByUid: args.uid,
    viaBatch: args.batch ?? false,
    createdAt: Date.now(),
  };
  await ref.create(grade); // immutable: create() refuses to overwrite (invariant 5)

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'approve',
    recordType: 'official_grade',
    recordId: ref.id,
    studentId: assessment.studentId,
    detail:
      `official grade v${grade.version} final=${finalScore} suggested=${suggested ?? 'n/a'}` +
      `${divergence.overridden ? ' (parent override)' : ''}` +
      `${grade.supersedesGradeId ? ` supersedes=${grade.supersedesGradeId}` : ''}` +
      `${grade.viaBatch ? ' (batch)' : ''}`,
  });
  return grade;
}

/**
 * Batch-approve high-confidence objective-autoscorable assessments, accepting
 * each AI suggestion as the final score. Every id must be individually batch-
 * eligible or the whole call is rejected before any grade is written.
 */
export async function batchApproveAssessments(args: {
  uid: string;
  householdId: string;
  assessmentIds: string[];
}): Promise<OfficialGrade[]> {
  const grades: OfficialGrade[] = [];
  for (const assessmentId of args.assessmentIds) {
    grades.push(
      await approveAssessment({
        uid: args.uid,
        householdId: args.householdId,
        assessmentId,
        batch: true,
      }),
    );
  }
  return grades;
}
