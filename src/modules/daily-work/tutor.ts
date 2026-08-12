// Module D — scaffolded tutor (server-only, Admin SDK).
//
// The tutor scaffolds within the ZPD (§8): it diagnoses, hints, shows parallel
// examples, chunks, and checks — it NEVER does the work, NEVER reveals a graded
// answer unless a parent enabled it per Course/Assignment, and NEVER goes
// off-material. Those hard-stops are enforced server-side (pure decisions in
// tutor-logic.ts) BEFORE any AI call. Every intervention — including a blocked
// one — is logged as an immutable Support Event.
//
// All AI routes through gateway J with purpose 'tutoring' (Essential). The
// gateway context is built WITHOUT any answer-key / teacher-guide material
// (invariant 2); a guard rejects any context that carries it.

import { adminDb } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { assertCollectionAllowed } from '../consent/consent';
import { recordAudit } from '../audit/audit';
import { invokeAI } from '../ai-gateway/gateway';
import {
  contextHasAnswerKeyMaterial,
  evaluateHardStops,
  shouldEscalate,
  zpdStepFor,
} from './tutor-logic';
import type {
  DifficultySignal,
  EscalationPolicy,
  SupportEvent,
  SupportEventKind,
  TutorConfig,
  TutorRequestType,
  ZpdStep,
} from './types';

export class TutorError extends Error {
  constructor(reason: string) {
    super(`tutor: ${reason}`);
    this.name = 'TutorError';
  }
}

function supportEventCol(hid: string) {
  return adminDb.collection(`households/${hid}/supportEvents`);
}

async function logSupportEvent(
  hid: string,
  fields: Omit<SupportEvent, 'id' | 'createdAt'>,
): Promise<SupportEvent> {
  const ref = supportEventCol(hid).doc();
  const event: SupportEvent = { ...fields, id: ref.id, createdAt: Date.now() };
  await ref.create(event); // append-only; create() refuses to overwrite
  return event;
}

export interface TutorResult {
  allowed: boolean;
  /** Support Events written for this turn (the intervention, plus escalation). */
  supportEvents: SupportEvent[];
  /** Tutor output when allowed; absent when a hard-stop blocked the request. */
  output?: unknown;
  escalated: boolean;
}

/**
 * Handle one tutoring turn for a Student's Submission.
 *
 * Order: authorize (fail-closed) → consent gate → hard-stop decision. A blocked
 * request logs a `blocked` Support Event and returns WITHOUT calling AI. An
 * allowed request builds an answer-key-free context, routes through gateway J,
 * logs the ZPD Support Event, then escalates to a parent if difficulty crossed
 * the policy bounds.
 */
export async function requestTutorHelp(args: {
  uid: string;
  householdId: string;
  studentId: string;
  submissionId: string;
  assignmentId: string;
  requestType: TutorRequestType;
  config: TutorConfig;
  onMaterial: boolean;
  /** Context-minimized prompt material — MUST NOT contain answer keys. */
  context: Record<string, unknown>;
  difficulty: DifficultySignal;
  escalationPolicy: EscalationPolicy;
  estimatedUnits?: number;
}): Promise<TutorResult> {
  // Authorization runs against the Support Event record (Student own-scope write).
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'support_event',
    action: 'write',
    studentId: args.studentId,
  });
  // Tutoring processes child data → consent gate (invariant 6).
  await assertCollectionAllowed(args.householdId, args.studentId);

  const zpdStep: ZpdStep | null = zpdStepFor(args.requestType);

  // Server-enforced hard-stops (§8): decided purely, enforced here.
  const decision = evaluateHardStops({
    requestType: args.requestType,
    config: args.config,
    onMaterial: args.onMaterial,
  });
  if (!decision.allowed) {
    const blocked = await logSupportEvent(args.householdId, {
      submissionId: args.submissionId,
      studentId: args.studentId,
      assignmentId: args.assignmentId,
      kind: 'blocked',
      zpdStep,
      hardStops: decision.reasons,
      usedAI: false,
    });
    await recordAudit({
      householdId: args.householdId,
      actorUid: args.uid,
      action: 'write',
      recordType: 'support_event',
      recordId: blocked.id,
      studentId: args.studentId,
      detail: `tutor hard-stop: ${decision.reasons.join(',')}`,
    });
    return { allowed: false, supportEvents: [blocked], escalated: false };
  }

  // Answer-key isolation (invariant 2): never let such material into the context.
  if (contextHasAnswerKeyMaterial(args.context)) {
    throw new TutorError('tutor context must not contain answer-key material');
  }

  const ai = await invokeAI(
    {
      uid: args.uid,
      householdId: args.householdId,
      record: 'support_event',
      studentId: args.studentId,
      purpose: 'tutoring',
      estimatedUnits: Math.max(1, args.estimatedUnits ?? 1),
    },
    { requestType: args.requestType, zpdStep, context: args.context },
  );
  if (!ai.ok) {
    // Essential work is never budget-denied by the ladder; a denial here means a
    // policy stop upstream. Surface it as an unallowed turn without an AI output.
    return { allowed: false, supportEvents: [], escalated: false };
  }

  const kind: SupportEventKind = zpdStep ?? 'diagnose';
  const events: SupportEvent[] = [
    await logSupportEvent(args.householdId, {
      submissionId: args.submissionId,
      studentId: args.studentId,
      assignmentId: args.assignmentId,
      kind,
      zpdStep,
      hardStops: [],
      usedAI: true,
    }),
  ];

  // Escalation after repeated difficulty (§8): log and hand to the parent.
  const escalated = shouldEscalate(args.difficulty, args.escalationPolicy);
  if (escalated) {
    events.push(
      await logSupportEvent(args.householdId, {
        submissionId: args.submissionId,
        studentId: args.studentId,
        assignmentId: args.assignmentId,
        kind: 'escalation',
        zpdStep,
        hardStops: [],
        usedAI: false,
      }),
    );
    await recordAudit({
      householdId: args.householdId,
      actorUid: args.uid,
      action: 'write',
      recordType: 'support_event',
      studentId: args.studentId,
      detail: 'tutor escalated to parent after repeated difficulty',
    });
  }

  return { allowed: true, supportEvents: events, output: ai.output, escalated };
}
