// Module D — scaffolded-tutor decisions (pure logic, unit-tested).
//
// Encodes §8: the ZPD progression, the server-enforced hard-stops (no
// graded-answer reveal unless a parent enabled it; never do the work; nothing
// off-material), and escalation after repeated difficulty. These are the
// decisions the tutor server (tutor.ts) enforces BEFORE any gateway-J call —
// they are pure and deterministic so they can be exhaustively unit-tested.

import {
  ZPD_STEPS,
  type DifficultySignal,
  type EscalationPolicy,
  type HardStopReason,
  type TutorConfig,
  type TutorRequestType,
  type ZpdStep,
} from './types';

export interface Check {
  ok: boolean;
  reason?: string;
}

// --- ZPD progression ---
/** The next scaffolding step after `current` (stays at `check` once reached). */
export function nextZpdStep(current: ZpdStep): ZpdStep {
  const i = ZPD_STEPS.indexOf(current);
  return ZPD_STEPS[Math.min(i + 1, ZPD_STEPS.length - 1)];
}

/** The ZPD step a request maps to, or null for control requests (reveal/do-work). */
export function zpdStepFor(requestType: TutorRequestType): ZpdStep | null {
  switch (requestType) {
    case 'hint':
      return 'hint';
    case 'example':
      return 'parallel_example';
    case 'check':
      return 'check';
    case 'explain':
      return 'diagnose';
    default:
      return null; // answer_reveal / do_the_work never map to a scaffolding step
  }
}

// --- server-enforced hard-stops (§8) ---
export interface HardStopInput {
  requestType: TutorRequestType;
  config: TutorConfig;
  /** Whether the request pertains to the assigned material (nothing off-material). */
  onMaterial: boolean;
}

export interface HardStopDecision {
  allowed: boolean;
  reasons: HardStopReason[];
}

/**
 * Decide whether a tutor request is permitted. Fails closed: any triggered
 * hard-stop blocks the request. The reasons are logged as a `blocked` Support
 * Event and no AI call is made.
 */
export function evaluateHardStops(input: HardStopInput): HardStopDecision {
  const reasons: HardStopReason[] = [];

  // Nothing off-material, ever.
  if (!input.onMaterial) reasons.push('off_material');

  // Never do the student's work.
  if (input.requestType === 'do_the_work') reasons.push('would_do_the_work');

  // Graded-answer reveal is off by default; only a parent toggle enables it.
  if (input.requestType === 'answer_reveal') {
    if (input.config.isGradedAssignment && !input.config.answerRevealEnabled) {
      reasons.push('graded_answer_reveal_disabled');
    }
  }

  return { allowed: reasons.length === 0, reasons };
}

// --- escalation ---
/** Escalate to a parent once repeated difficulty crosses any policy bound (§8). */
export function shouldEscalate(signal: DifficultySignal, policy: EscalationPolicy): boolean {
  return (
    signal.hintsUsed > policy.maxHints ||
    signal.failedChecks > policy.maxFailedChecks ||
    signal.consecutiveWrong > policy.maxConsecutiveWrong
  );
}

// --- answer-key isolation (invariant 2) ---
/**
 * Assert the context handed to the tutor gateway carries NO answer-key /
 * teacher-guide material. The tutor context is built without it; this is a
 * belt-and-suspenders guard against a caller ever attaching such fields.
 */
const FORBIDDEN_CONTEXT_KEYS = ['answerKey', 'answerKeys', 'teacherGuide', 'solutions', 'gradedAnswer'];

export function contextHasAnswerKeyMaterial(context: Record<string, unknown>): boolean {
  return FORBIDDEN_CONTEXT_KEYS.some((k) => k in context);
}
