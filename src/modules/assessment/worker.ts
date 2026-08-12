// Module E — the idempotent async assessment worker (Cloud Tasks -> Cloud Run).
//
// Consumes a `Submitted` submission handed off by module D (the
// `assessmentEnqueuedAt` marker). At-least-once delivery: an assessment already
// present for the submission makes a duplicate a no-op. The worker routes
// through gateway J (`purpose: 'assessment'`, Essential), builds the mandatory
// disclosure envelope, classifies assessability, and publishes an ADVISORY
// AssessmentReady. It builds NO grade — the Official Grade is a separate,
// parent-approved record (grading.ts). Answer-key/teacher-guide material NEVER
// enters the assessment context (invariant 2).

import { adminDb, FieldValue } from '../../lib/firebase/admin';
import { invokeAI } from '../ai-gateway/gateway';
import { assertCollectionAllowed } from '../consent/consent';
import { recordAudit } from '../audit/audit';
import { assertTransition } from './assessment-state-machine';
import { assessabilityFor, contextHasAnswerKeyMaterial } from './disclosure';
import type {
  AIAssessment,
  AssignmentKind,
  AssistanceContext,
  DisclosureEnvelope,
} from './types';

export class AssessmentError extends Error {
  constructor(reason: string) {
    super(`assessment: ${reason}`);
    this.name = 'AssessmentError';
  }
}

function submissionRef(hid: string, sid: string) {
  return adminDb.doc(`households/${hid}/submissions/${sid}`);
}
function assessmentsCol(hid: string) {
  return adminDb.collection(`households/${hid}/aiAssessments`);
}
function supportEventsCol(hid: string) {
  return adminDb.collection(`households/${hid}/supportEvents`);
}

/** Summarize the Submission's Support Events into disclosed assistance context. */
async function assistanceFor(hid: string, submissionId: string): Promise<AssistanceContext> {
  const snap = await supportEventsCol(hid).where('submissionId', '==', submissionId).get();
  let usedAICount = 0;
  let hardStopCount = 0;
  for (const d of snap.docs) {
    if (d.get('usedAI') === true) usedAICount += 1;
    if (d.get('kind') === 'blocked') hardStopCount += 1;
  }
  return { supportEventCount: snap.size, usedAICount, hardStopCount };
}

/**
 * Run the assessment for one Submitted submission. Idempotent on the presence of
 * an existing assessment for the submission.
 */
export async function assessSubmission(args: {
  uid: string;
  householdId: string;
  submissionId: string;
  assignmentId: string;
  studentId: string;
  /** The Assignment's declared shape (drives assessability). */
  assignmentKind: AssignmentKind;
  /** Context-minimized material — MUST NOT contain answer-key material. */
  context: Record<string, unknown>;
  estimatedUnits?: number;
}): Promise<AIAssessment> {
  // Consent gate: assessment processes a specific Student's child data.
  await assertCollectionAllowed(args.householdId, args.studentId);

  // Idempotency: a duplicate delivery must not produce a second assessment.
  const existing = await assessmentsCol(args.householdId)
    .where('submissionId', '==', args.submissionId)
    .limit(1)
    .get();
  if (!existing.empty) return existing.docs[0].data() as AIAssessment;

  // Confirm the submission was actually handed off for assessment (module D).
  const subSnap = await submissionRef(args.householdId, args.submissionId).get();
  if (!subSnap.exists) throw new AssessmentError('unknown submission');
  if (subSnap.get('state') !== 'Submitted') {
    throw new AssessmentError('submission is not in Submitted');
  }
  const evidenceIds = (subSnap.get('evidenceIds') as string[]) ?? [];

  // Answer-key isolation (invariant 2): reject any answer-key material up front.
  if (contextHasAnswerKeyMaterial(args.context)) {
    throw new AssessmentError('assessment context must not contain answer-key material');
  }

  // Open the assessment in AIAssessing.
  const ref = assessmentsCol(args.householdId).doc();
  const now = Date.now();
  const opening: AIAssessment = {
    id: ref.id,
    submissionId: args.submissionId,
    assignmentId: args.assignmentId,
    studentId: args.studentId,
    state: 'AIAssessing',
    assessabilityClass: 'not-assessable-needs-adult',
    envelope: {
      suggestedScore: null,
      rationale: '',
      confidence: null,
      uncertainty: null,
      assistance: { supportEventCount: 0, usedAICount: 0, hardStopCount: 0 },
      evidenceExamined: evidenceIds,
    },
    supersedesAssessmentId: null,
    aiProvenance: null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.create(opening);

  // Route through gateway J. Assessment is Essential and never budget-severed.
  const ai = await invokeAI(
    {
      uid: args.uid,
      householdId: args.householdId,
      record: 'ai_assessment',
      studentId: args.studentId,
      purpose: 'assessment',
      estimatedUnits: Math.max(1, args.estimatedUnits ?? 1),
    },
    { assignmentId: args.assignmentId, submissionId: args.submissionId, context: args.context },
  );

  const assistance = await assistanceFor(args.householdId, args.submissionId);

  // Map the (advisory) model output to the disclosure envelope. Observation work
  // and any unreadable submission yield a not-assessable envelope with no number;
  // real extraction maps structured model output to score/confidence/uncertainty.
  const scorable = ai.ok && args.assignmentKind !== 'observation';
  const envelope: DisclosureEnvelope = {
    suggestedScore: scorable ? 1 : null,
    rationale: scorable ? 'advisory suggestion (stub provider)' : 'requires an adult',
    confidence: scorable ? 1 : null,
    uncertainty: scorable ? { unreadPortions: [], notes: '' } : null,
    assistance,
    evidenceExamined: evidenceIds,
  };
  const assessabilityClass = assessabilityFor(args.assignmentKind, envelope);

  await assertTransition('AIAssessing', 'AssessmentReady');
  await ref.update({
    state: 'AssessmentReady',
    assessabilityClass,
    envelope,
    aiProvenance: ai.ok ? { vendor: ai.vendor, model: ai.model, feature: ai.feature } : null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'write',
    recordType: 'ai_assessment',
    recordId: ref.id,
    studentId: args.studentId,
    detail: `assessment ready submission=${args.submissionId} class=${assessabilityClass} (advisory, no grade built)`,
  });

  return { ...opening, state: 'AssessmentReady', assessabilityClass, envelope };
}
