// Module I — Overage authorization (pure logic, unit-tested).
// docs/mvp-specification.md §12. No I/O; deterministic.
//
// Overage is a DEFAULT $0 hard cap (a true cap, not a soft warning). Lifting it
// is an explicit, CAPPED, REVOCABLE, Household-Owner-only authorization with a
// DISCLOSED per-unit price. This file validates the request purely and applies /
// revokes the ceiling ON THE ALLOWANCE — and it NEVER touches the included
// allowance or the protected reserve, so essential learning stays funded whether
// overage is $0 or lifted (invariant 7: reserve independence). The authority
// (Owner-only) and the audited record live in billing.ts.

import {
  MAX_OVERAGE_CEILING_UNITS,
  type AllowanceState,
  type OverageAuthorizationInput,
  type OverageAuthorizationResult,
} from './types';

/**
 * Validate an overage authorization. Fail-closed even when the Owner opts in:
 * the ceiling must be positive and within the hard maximum, and the per-unit
 * price must be disclosed (> 0). An invalid request yields a $0 ceiling.
 */
export function validateOverageAuthorization(
  input: OverageAuthorizationInput,
): OverageAuthorizationResult {
  if (input.disclosedUnitPriceCents <= 0) {
    return { valid: false, ceilingUnits: 0, reason: 'unit_price_must_be_disclosed' };
  }
  if (input.requestedCeilingUnits <= 0) {
    return { valid: false, ceilingUnits: 0, reason: 'ceiling_must_be_positive' };
  }
  if (input.requestedCeilingUnits > MAX_OVERAGE_CEILING_UNITS) {
    return { valid: false, ceilingUnits: 0, reason: 'ceiling_exceeds_max' };
  }
  return { valid: true, ceilingUnits: input.requestedCeilingUnits };
}

/**
 * Apply a VALIDATED overage ceiling to an allowance. Returns a new state with
 * only `overageCeilingUnits` changed — the included allowance and the protected
 * reserve are untouched (reserve independence). Throws if handed an unvalidated /
 * out-of-bounds ceiling, so an invalid ceiling can never reach the allowance.
 */
export function applyOverageCeiling(
  state: AllowanceState,
  ceilingUnits: number,
): AllowanceState {
  if (
    !Number.isFinite(ceilingUnits) ||
    ceilingUnits <= 0 ||
    ceilingUnits > MAX_OVERAGE_CEILING_UNITS
  ) {
    throw new Error(`overage: refusing to apply out-of-bounds ceiling ${ceilingUnits}`);
  }
  return { ...state, overageCeilingUnits: ceilingUnits };
}

/**
 * Revoke overage: return the ceiling to the $0 hard-cap default. Only
 * `overageCeilingUnits` changes; the reserve and included allowance are untouched,
 * and any overage already consumed this period is preserved on the record.
 */
export function revokeOverageCeiling(state: AllowanceState): AllowanceState {
  return { ...state, overageCeilingUnits: 0 };
}
