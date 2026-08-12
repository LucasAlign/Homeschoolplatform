// Module E — disclosure-envelope completeness + assessability derivation
// (pure logic, unit-tested). docs/mvp-specification.md §8.
//
// The disclosure envelope is mandatory: a parent must see the suggested score,
// its rationale, the confidence, the uncertainty/unread portions, the assistance
// context, and the evidence examined. The core rule (§8): an assessment that
// CANNOT populate confidence + uncertainty renders as `not-assessable-needs-
// adult` with NO number. This file is the single place that rule lives, so the
// worker and the routing agree.

import type {
  AssessabilityClass,
  AssignmentKind,
  DisclosureEnvelope,
} from './types';

export interface Check {
  ok: boolean;
  reason?: string;
}

/**
 * Whether the envelope carries enough to render a NUMBER to the parent. Both
 * confidence and uncertainty must be populated; a suggested score without them
 * is not a defensible advisory suggestion.
 */
export function disclosureComplete(env: DisclosureEnvelope): Check {
  if (env.confidence === null) {
    return { ok: false, reason: 'confidence could not be established' };
  }
  if (env.uncertainty === null) {
    return { ok: false, reason: 'uncertainty could not be established' };
  }
  if (env.suggestedScore === null) {
    return { ok: false, reason: 'no suggested score' };
  }
  return { ok: true };
}

/**
 * Derive the assessability class from the assignment shape and envelope
 * completeness. Observation work always needs an adult; an incomplete envelope
 * (missing confidence/uncertainty/score) forces `not-assessable-needs-adult` no
 * matter the assignment kind (§8).
 */
export function assessabilityFor(
  assignmentKind: AssignmentKind,
  env: DisclosureEnvelope,
): AssessabilityClass {
  if (assignmentKind === 'observation') return 'not-assessable-needs-adult';
  if (!disclosureComplete(env).ok) return 'not-assessable-needs-adult';
  return assignmentKind === 'objective'
    ? 'objective-autoscorable'
    : 'subjective-rubric';
}

// --- answer-key isolation guard (invariant 2) ---
//
// Answer keys / teacher guides NEVER enter the AI-assessment generative context
// (invariant 2; §8). The context is built without them; this belt-and-suspenders
// guard rejects any caller that attaches such a field. Mirrors the tutor guard
// in module D so both AI paths share the same forbidden-key vocabulary.
const FORBIDDEN_CONTEXT_KEYS = [
  'answerKey',
  'answerKeys',
  'teacherGuide',
  'solutions',
  'gradedAnswer',
  'answers',
];

export function contextHasAnswerKeyMaterial(context: Record<string, unknown>): boolean {
  return FORBIDDEN_CONTEXT_KEYS.some((k) => k in context);
}
