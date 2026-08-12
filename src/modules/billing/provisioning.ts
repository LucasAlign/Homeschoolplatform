// Module I — Allowance provisioning (pure logic, unit-tested).
// docs/mvp-specification.md §12. No I/O; produces exactly module J's
// AllowanceState shape (src/modules/ai-gateway/types.ts) — module I FUNDS what
// module J ENFORCES, and never changes module J.
//
// A period funds a POOLED household included allowance (per-Student included
// units × active Students) plus a per-Student PROTECTED RESERVE floor. Two
// non-negotiables live here:
//   1. Provisioning is INDEPENDENT of overage — the reserve is derived from the
//      active-Student count alone, so essential learning is funded even at the
//      default $0 overage ceiling (invariant 7).
//   2. A newly provisioned period starts fail-closed at overageCeilingUnits = 0
//      (a true $0 hard cap); lifting it is a separate, explicit Owner act
//      (overage.ts). A period reset zeroes the usage counters.

import {
  INCLUDED_UNITS_PER_STUDENT,
  RESERVE_UNITS_PER_STUDENT,
  type AllowanceState,
  type ProvisioningInput,
} from './types';

export class ProvisioningError extends Error {
  constructor(reason: string) {
    super(`provisioning: ${reason}`);
    this.name = 'ProvisioningError';
  }
}

/**
 * Provision a period's AllowanceState from the active-Student count. Pooled
 * included units scale with active Students; the per-Student reserve floor is set
 * from the count-independent constant (module J keys the reserve per Student).
 * The overage ceiling always starts at $0 (fail-closed) — reserve funding does
 * NOT depend on it. Usage counters start empty (period reset).
 */
export function provisionAllowance(input: ProvisioningInput): AllowanceState {
  const count = input.activeStudentCount;
  if (!Number.isInteger(count) || count < 0) {
    throw new ProvisioningError('activeStudentCount must be a non-negative integer');
  }
  const includedPerStudent = input.includedUnitsPerStudent ?? INCLUDED_UNITS_PER_STUDENT;
  const reservePerStudent = input.reserveUnitsPerStudent ?? RESERVE_UNITS_PER_STUDENT;
  if (includedPerStudent < 0 || reservePerStudent < 0) {
    throw new ProvisioningError('unit funding must be non-negative');
  }

  return {
    householdId: input.householdId,
    periodStart: input.periodStart,
    includedUnits: includedPerStudent * count,
    usedUnits: 0,
    // Per-Student protected Essential floor — computed from the Student count
    // ONLY, never from the overage ceiling (invariant 7: reserve independence).
    reservePerStudentUnits: reservePerStudent,
    reserveUsedByStudent: {},
    // Default $0 hard cap — a fresh period never carries an overage authorization
    // forward; the Owner re-authorizes explicitly if desired (overage.ts).
    overageCeilingUnits: 0,
    overageUsedUnits: 0,
  };
}

/**
 * Reset an existing allowance into a new period: recompute funding for the
 * (possibly changed) active-Student count and zero every usage counter. The
 * overage ceiling returns to the $0 default — each period starts fail-closed and
 * the Owner re-authorizes overage per period if desired. Reserve funding is again
 * independent of any prior overage.
 */
export function resetPeriodAllowance(
  input: ProvisioningInput,
): AllowanceState {
  // A reset is provisioning against the new period anchor; the fail-closed $0
  // overage default and empty counters are exactly what provisionAllowance sets.
  return provisionAllowance(input);
}
