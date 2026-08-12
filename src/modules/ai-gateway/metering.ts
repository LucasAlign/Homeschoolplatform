// Module J — the enforcement ladder (pure logic, unit-tested).
//
// Invariant 7: essential learning is never severed by budget. Budget pressure
// always bites Discretionary first; Essential draws from the protected reserve
// and is never budget-denied (a depleted reserve raises a review flag, it does
// not block). See docs/mvp-specification.md §12.

import {
  costClassFor,
  HOUSEHOLD_RESERVE_KEY,
  type AICallRequest,
  type AllowanceState,
  type EnforcementDecision,
} from './types';

export function reserveKey(req: AICallRequest): string {
  return req.studentId ?? HOUSEHOLD_RESERVE_KEY;
}

export function reserveRemaining(state: AllowanceState, key: string): number {
  const used = state.reserveUsedByStudent[key] ?? 0;
  return Math.max(0, state.reservePerStudentUnits - used);
}

/**
 * Decide whether an AI call may proceed and from which budget source.
 * Pure and deterministic — the gateway applies the side effects.
 */
export function evaluateEnforcement(
  state: AllowanceState,
  req: AICallRequest,
): EnforcementDecision {
  const units = Math.max(0, req.estimatedUnits);
  const remainingAllowance = Math.max(0, state.includedUnits - state.usedUnits);

  if (units <= remainingAllowance) {
    return { allow: true, source: 'allowance', reason: 'within_allowance' };
  }

  const cls = costClassFor(req.purpose, req.extraordinary);

  if (cls === 'essential') {
    // Essential is never budget-denied. Draw from the protected reserve;
    // if the reserve is depleted, still allow but flag for review.
    const reserve = reserveRemaining(state, reserveKey(req));
    if (units <= reserve) {
      return { allow: true, source: 'reserve', reason: 'drawn_from_reserve' };
    }
    return { allow: true, source: 'reserve', reason: 'reserve_low_flag_review' };
  }

  // Discretionary: gated once the allowance is exhausted.
  if (state.overageCeilingUnits > 0) {
    const overageRemaining = Math.max(0, state.overageCeilingUnits - state.overageUsedUnits);
    if (units <= overageRemaining) {
      return { allow: true, source: 'overage', reason: 'within_allowance' };
    }
    return { allow: false, source: 'none', reason: 'overage_ceiling_reached' };
  }

  return { allow: false, source: 'none', reason: 'allowance_exhausted_no_overage' };
}
