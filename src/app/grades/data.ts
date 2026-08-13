// Server data-access for the parent grade-approval queue (module E).
//
// Reads run through the Admin SDK (which bypasses Firestore rules), so every
// read first calls `authorize()` for `official_grade` read — the same fail-closed
// gate the approval path uses (invariant 3). The client only supplies an
// assessment id; the household and the rest are re-derived from the session.
//
// Display routing note: `routeApproval` (module E) needs the four RoutingSignals.
// `largeSwing` is derived here from the current Official Grade; the other three
// (transcribed / flagged / missingEvidence) are NOT persisted on the assessment
// and are shown as their default (false) until module D/G wire them through — the
// server approval re-derives them identically, so the displayed lane matches what
// approval will enforce.

import { adminDb } from '../../lib/firebase/admin';
import { authorize } from '../../modules/identity/authorize';
import { routeApproval } from '../../modules/assessment/grade-routing';
import { isLargeSwing } from '../../modules/assessment/official-grade';
import type {
  AIAssessment,
  ApprovalRoute,
  OfficialGrade,
} from '../../modules/assessment/types';
import { requireSession } from '../../lib/auth/session';

export interface PendingAssessment {
  assessmentId: string;
  studentId: string;
  assignmentId: string;
  assessabilityClass: AIAssessment['assessabilityClass'];
  suggestedScore: number | null;
  confidence: number | null;
  route: ApprovalRoute;
  routeReason: string;
  batchEligible: boolean;
  supportEventCount: number;
  usedAICount: number;
  hardStopCount: number;
  hasUncertainty: boolean;
  createdAt: number;
}

export interface AssessmentDetail {
  assessment: AIAssessment;
  route: ApprovalRoute;
  routeReason: string;
  batchEligible: boolean;
  /** The current Official Grade for this Assignment+Student (suggested-vs-final context). */
  priorFinalScore: number | null;
}

function assessmentsCol(hid: string) {
  return adminDb.collection(`households/${hid}/aiAssessments`);
}
function gradesCol(hid: string) {
  return adminDb.collection(`households/${hid}/officialGrades`);
}

/** Highest-version Official Grade for an Assignment+Student (composite-indexed). */
async function currentFinalScore(
  hid: string,
  assignmentId: string,
  studentId: string,
): Promise<number | null> {
  const snap = await gradesCol(hid)
    .where('assignmentId', '==', assignmentId)
    .where('studentId', '==', studentId)
    .orderBy('version', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return (snap.docs[0].data() as OfficialGrade).finalScore;
}

function routeOf(assessment: AIAssessment, priorFinal: number | null) {
  const largeSwing = isLargeSwing(priorFinal, assessment.envelope.suggestedScore);
  return routeApproval({
    assessabilityClass: assessment.assessabilityClass,
    confidence: assessment.envelope.confidence,
    // See "Display routing note" above — the other three default to false.
    signals: { transcribed: false, flagged: false, missingEvidence: false, largeSwing },
  });
}

/** Whether this assessment has already been approved into a grade (one per approval). */
async function alreadyGraded(hid: string, assessmentId: string): Promise<boolean> {
  const snap = await gradesCol(hid)
    .where('sourceAssessmentId', '==', assessmentId)
    .limit(1)
    .get();
  return !snap.empty;
}

/** Every assessment in `AssessmentReady` awaiting the parent grade gate, newest first. */
export async function listPendingAssessments(): Promise<PendingAssessment[]> {
  const { uid, householdId } = await requireSession();
  await authorize({ uid, householdId, record: 'official_grade', action: 'read' });

  const snap = await assessmentsCol(householdId).where('state', '==', 'AssessmentReady').get();

  const rows: PendingAssessment[] = [];
  for (const d of snap.docs) {
    const a = d.data() as AIAssessment;
    if (await alreadyGraded(householdId, a.id)) continue; // approved elsewhere; drop
    const priorFinal = await currentFinalScore(householdId, a.assignmentId, a.studentId);
    const routing = routeOf(a, priorFinal);
    const env = a.envelope;
    rows.push({
      assessmentId: a.id,
      studentId: a.studentId,
      assignmentId: a.assignmentId,
      assessabilityClass: a.assessabilityClass,
      suggestedScore: env.suggestedScore,
      confidence: env.confidence,
      route: routing.route,
      routeReason: routing.reason,
      batchEligible: routing.batchEligible,
      supportEventCount: env.assistance.supportEventCount,
      usedAICount: env.assistance.usedAICount,
      hardStopCount: env.assistance.hardStopCount,
      hasUncertainty: env.uncertainty !== null && env.uncertainty.unreadPortions.length > 0,
      createdAt: a.createdAt,
    });
  }
  rows.sort((x, y) => y.createdAt - x.createdAt);
  return rows;
}

/** Detail for one AssessmentReady assessment, or `null` if it isn't awaiting approval. */
export async function getAssessmentDetail(assessmentId: string): Promise<AssessmentDetail | null> {
  const { uid, householdId } = await requireSession();
  await authorize({ uid, householdId, record: 'official_grade', action: 'read' });

  const snap = await assessmentsCol(householdId).doc(assessmentId).get();
  if (!snap.exists) return null;
  const assessment = snap.data() as AIAssessment;
  if (assessment.state !== 'AssessmentReady') return null;
  if (await alreadyGraded(householdId, assessmentId)) return null;

  const priorFinalScore = await currentFinalScore(
    householdId,
    assessment.assignmentId,
    assessment.studentId,
  );
  const routing = routeOf(assessment, priorFinalScore);
  return {
    assessment,
    route: routing.route,
    routeReason: routing.reason,
    batchEligible: routing.batchEligible,
    priorFinalScore,
  };
}
