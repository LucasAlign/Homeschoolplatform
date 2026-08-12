// Module H — School-Year completion-precondition evaluation (pure logic,
// unit-tested). docs/mvp-specification.md §11.
//
// Completion is a Household-Owner act gated on: every in-scope Assignment
// terminal (graded / exempted / explicitly-acknowledged-incomplete), NO pending
// AI Assessment, and NO unresolved Review Flag. Otherwise it is BLOCKED — unless
// the Owner explicitly acknowledges + records the incompletes, which yields a
// recorded `Partial` year rather than `Completed`. `Withdrawn` is always
// available to the Owner regardless of blockers. This file computes the decision;
// it holds no authority (that is authorize()) and does no I/O.

import {
  TERMINAL_ASSIGNMENT_STATUSES,
  type AssignmentCompletionStatus,
  type CompletionEvaluation,
  type CompletionInput,
} from './types';

const TERMINAL = new Set<AssignmentCompletionStatus>(TERMINAL_ASSIGNMENT_STATUSES);

/** Whether an Assignment's status counts as terminal for year completion. */
export function isTerminalAssignment(status: AssignmentCompletionStatus): boolean {
  return TERMINAL.has(status);
}

/**
 * Evaluate the completion preconditions. Pure and content-free: it consumes
 * counts + statuses and returns whether the completion may proceed, the terminal
 * outcome, and content-free blocker reasons.
 *
 * - `withdraw` intent always proceeds (Owner authority) → `Withdrawn`; any
 *   outstanding items are still surfaced as blockers for the record.
 * - `complete` intent with no blockers → `Completed`.
 * - `complete` intent with blockers → `Partial` when the Owner acknowledged the
 *   incompletes, otherwise BLOCKED (allowed = false).
 */
export function evaluateCompletionPreconditions(input: CompletionInput): CompletionEvaluation {
  const blockers: string[] = [];

  const nonTerminal = input.assignments.filter((a) => !isTerminalAssignment(a.status));
  if (nonTerminal.length > 0) {
    blockers.push(`${nonTerminal.length} assignment(s) not in a terminal state`);
  }
  if (input.pendingAssessmentCount > 0) {
    blockers.push(`${input.pendingAssessmentCount} pending AI assessment(s)`);
  }
  if (input.unresolvedFlagCount > 0) {
    blockers.push(`${input.unresolvedFlagCount} unresolved review flag(s)`);
  }

  if (input.intent === 'withdraw') {
    // Withdrawal is an Owner prerogative; it records the state as-is.
    return {
      allowed: true,
      blockers,
      incompleteAcknowledged: blockers.length > 0,
      outcome: 'Withdrawn',
    };
  }

  if (blockers.length === 0) {
    return { allowed: true, blockers, incompleteAcknowledged: false, outcome: 'Completed' };
  }

  // Blockers exist: only an explicit acknowledgement unblocks, and it downgrades
  // the outcome to a recorded `Partial` (never a silent `Completed`).
  if (input.acknowledgeIncomplete) {
    return { allowed: true, blockers, incompleteAcknowledged: true, outcome: 'Partial' };
  }

  return { allowed: false, blockers, incompleteAcknowledged: false, outcome: 'Partial' };
}
