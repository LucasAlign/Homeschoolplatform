import { describe, expect, it } from 'vitest';
import {
  canTransitionSubscription,
  assertSubscriptionTransition,
  isTerminalSubscription,
  SubscriptionTransitionError,
} from '../../src/modules/billing/subscription-state-machine';
import {
  computeSubscriptionQuote,
  discountBpsForOrdinal,
  perStudentMonthlyCents,
  PricingError,
} from '../../src/modules/billing/pricing';
import {
  provisionAllowance,
  resetPeriodAllowance,
  ProvisioningError,
} from '../../src/modules/billing/provisioning';
import {
  validateOverageAuthorization,
  applyOverageCeiling,
  revokeOverageCeiling,
} from '../../src/modules/billing/overage';
import {
  BASE_MONTHLY_CENTS_PER_STUDENT,
  INCLUDED_UNITS_PER_STUDENT,
  RESERVE_UNITS_PER_STUDENT,
  MAX_OVERAGE_CEILING_UNITS,
  DEFAULT_SCHOOL_YEAR_MONTHS,
} from '../../src/modules/billing/types';

// --- Subscription state machine ---
describe('subscription state machine', () => {
  it('runs active ↔ past_due and → canceled, canceled terminal', () => {
    expect(canTransitionSubscription('active', 'past_due')).toBe(true);
    expect(canTransitionSubscription('active', 'canceled')).toBe(true);
    expect(canTransitionSubscription('past_due', 'active')).toBe(true);
    expect(canTransitionSubscription('past_due', 'canceled')).toBe(true);
    expect(isTerminalSubscription('canceled')).toBe(true);
    expect(canTransitionSubscription('canceled', 'active')).toBe(false);
  });

  it('throws on an illegal transition', () => {
    expect(() => assertSubscriptionTransition('canceled', 'active')).toThrow(
      SubscriptionTransitionError,
    );
    expect(() => assertSubscriptionTransition('active', 'active')).toThrow(
      SubscriptionTransitionError,
    );
  });
});

// --- Pricing: per-active-Student + sibling discount + free adults ---
describe('subscription pricing', () => {
  it('charges the first Student full base price', () => {
    expect(discountBpsForOrdinal(1)).toBe(0);
    expect(perStudentMonthlyCents(1)).toBe(BASE_MONTHLY_CENTS_PER_STUDENT);
    const q = computeSubscriptionQuote({ activeStudentCount: 1 });
    expect(q.monthlyTotalCents).toBe(1000);
    expect(q.annualTotalCents).toBe(1000 * DEFAULT_SCHOOL_YEAR_MONTHS);
    expect(q.perStudentMonthlyCents).toEqual([1000]);
  });

  it('applies ordinal sibling discounts (2nd–3rd, then 4th+ deeper)', () => {
    expect(discountBpsForOrdinal(2)).toBe(1500);
    expect(discountBpsForOrdinal(3)).toBe(1500);
    expect(discountBpsForOrdinal(4)).toBe(2500);
    // 2nd student: 15% off $10 = $8.50; 4th: 25% off = $7.50.
    expect(perStudentMonthlyCents(2)).toBe(850);
    expect(perStudentMonthlyCents(4)).toBe(750);

    const q = computeSubscriptionQuote({ activeStudentCount: 4 });
    expect(q.perStudentMonthlyCents).toEqual([1000, 850, 850, 750]);
    expect(q.monthlyTotalCents).toBe(1000 + 850 + 850 + 750);
    expect(q.annualTotalCents).toBe(q.monthlyTotalCents * 12);
  });

  it('makes adult accounts free ($0), whatever the count', () => {
    const q = computeSubscriptionQuote({ activeStudentCount: 2, adultCount: 3 });
    expect(q.adultCount).toBe(3);
    expect(q.adultChargeCents).toBe(0);
    // The adult count never changes the household total.
    const noAdults = computeSubscriptionQuote({ activeStudentCount: 2 });
    expect(q.monthlyTotalCents).toBe(noAdults.monthlyTotalCents);
  });

  it('prices a household with zero active Students at $0', () => {
    const q = computeSubscriptionQuote({ activeStudentCount: 0, adultCount: 2 });
    expect(q.perStudentMonthlyCents).toEqual([]);
    expect(q.monthlyTotalCents).toBe(0);
    expect(q.annualTotalCents).toBe(0);
  });

  it('honours a custom school-year term', () => {
    const q = computeSubscriptionQuote({ activeStudentCount: 1, schoolYearMonths: 10 });
    expect(q.annualTotalCents).toBe(1000 * 10);
  });

  it('rejects invalid inputs', () => {
    expect(() => computeSubscriptionQuote({ activeStudentCount: -1 })).toThrow(PricingError);
    expect(() => computeSubscriptionQuote({ activeStudentCount: 1.5 })).toThrow(PricingError);
    expect(() =>
      computeSubscriptionQuote({ activeStudentCount: 1, schoolYearMonths: 0 }),
    ).toThrow(PricingError);
  });
});

// --- Allowance provisioning: produces a valid module-J AllowanceState ---
describe('allowance provisioning', () => {
  it('funds pooled included units by active-Student count and a per-Student reserve', () => {
    const a = provisionAllowance({
      householdId: 'h1',
      activeStudentCount: 3,
      periodStart: 1000,
    });
    expect(a.householdId).toBe('h1');
    expect(a.periodStart).toBe(1000);
    expect(a.includedUnits).toBe(INCLUDED_UNITS_PER_STUDENT * 3);
    expect(a.reservePerStudentUnits).toBe(RESERVE_UNITS_PER_STUDENT);
    // Period reset: every usage counter starts empty.
    expect(a.usedUnits).toBe(0);
    expect(a.reserveUsedByStudent).toEqual({});
    expect(a.overageUsedUnits).toBe(0);
  });

  it('starts a fresh period at the default $0 overage ceiling (fail-closed)', () => {
    const a = provisionAllowance({ householdId: 'h1', activeStudentCount: 2, periodStart: 0 });
    expect(a.overageCeilingUnits).toBe(0);
  });

  it('resetPeriodAllowance zeroes counters and returns the ceiling to $0', () => {
    const reset = resetPeriodAllowance({
      householdId: 'h1',
      activeStudentCount: 2,
      periodStart: 5000,
    });
    expect(reset.periodStart).toBe(5000);
    expect(reset.usedUnits).toBe(0);
    expect(reset.overageCeilingUnits).toBe(0);
    expect(reset.overageUsedUnits).toBe(0);
  });

  it('accepts per-Student funding overrides', () => {
    const a = provisionAllowance({
      householdId: 'h1',
      activeStudentCount: 2,
      periodStart: 0,
      includedUnitsPerStudent: 500,
      reserveUnitsPerStudent: 100,
    });
    expect(a.includedUnits).toBe(1000);
    expect(a.reservePerStudentUnits).toBe(100);
  });

  it('rejects invalid inputs', () => {
    expect(() =>
      provisionAllowance({ householdId: 'h1', activeStudentCount: -1, periodStart: 0 }),
    ).toThrow(ProvisioningError);
  });

  it('funds the protected reserve even for a household with zero Students at $0 overage', () => {
    // Reserve floor is per-Student and independent of overage; a zero-student
    // household simply has no reserve buckets in use, but the floor is set.
    const a = provisionAllowance({ householdId: 'h1', activeStudentCount: 0, periodStart: 0 });
    expect(a.reservePerStudentUnits).toBe(RESERVE_UNITS_PER_STUDENT);
    expect(a.overageCeilingUnits).toBe(0);
  });
});

// --- Overage authorization: default $0, capped, revocable → $0 ---
describe('overage authorization', () => {
  it('validates a well-formed authorization within the hard max', () => {
    const r = validateOverageAuthorization({
      requestedCeilingUnits: 500,
      disclosedUnitPriceCents: 3,
    });
    expect(r.valid).toBe(true);
    expect(r.ceilingUnits).toBe(500);
  });

  it('rejects a non-positive ceiling (default $0 stays a hard cap)', () => {
    const r = validateOverageAuthorization({ requestedCeilingUnits: 0, disclosedUnitPriceCents: 3 });
    expect(r.valid).toBe(false);
    expect(r.ceilingUnits).toBe(0);
    expect(r.reason).toBe('ceiling_must_be_positive');
  });

  it('rejects a ceiling above the hard maximum', () => {
    const r = validateOverageAuthorization({
      requestedCeilingUnits: MAX_OVERAGE_CEILING_UNITS + 1,
      disclosedUnitPriceCents: 3,
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('ceiling_exceeds_max');
  });

  it('requires the per-unit price to be disclosed', () => {
    const r = validateOverageAuthorization({ requestedCeilingUnits: 100, disclosedUnitPriceCents: 0 });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('unit_price_must_be_disclosed');
  });

  it('applies a validated ceiling and revokes back to $0', () => {
    const base = provisionAllowance({ householdId: 'h1', activeStudentCount: 2, periodStart: 0 });
    expect(base.overageCeilingUnits).toBe(0);

    const lifted = applyOverageCeiling(base, 500);
    expect(lifted.overageCeilingUnits).toBe(500);

    const revoked = revokeOverageCeiling(lifted);
    expect(revoked.overageCeilingUnits).toBe(0);
  });

  it('refuses to apply an out-of-bounds ceiling (fail-closed even on opt-in)', () => {
    const base = provisionAllowance({ householdId: 'h1', activeStudentCount: 1, periodStart: 0 });
    expect(() => applyOverageCeiling(base, 0)).toThrow();
    expect(() => applyOverageCeiling(base, MAX_OVERAGE_CEILING_UNITS + 1)).toThrow();
  });
});

// --- Reserve independence: essential learning funded even at $0 overage ---
describe('reserve provisioning is independent of overage (invariant 7)', () => {
  it('leaves the included allowance + reserve untouched when overage is lifted', () => {
    const base = provisionAllowance({ householdId: 'h1', activeStudentCount: 3, periodStart: 0 });

    const lifted = applyOverageCeiling(base, 500);
    // Only the ceiling moves — included units and the reserve floor are identical.
    expect(lifted.includedUnits).toBe(base.includedUnits);
    expect(lifted.reservePerStudentUnits).toBe(base.reservePerStudentUnits);
    expect(lifted.reserveUsedByStudent).toEqual(base.reserveUsedByStudent);
  });

  it('leaves the reserve untouched when overage is revoked to $0', () => {
    const base = provisionAllowance({ householdId: 'h1', activeStudentCount: 3, periodStart: 0 });
    const revoked = revokeOverageCeiling(applyOverageCeiling(base, 500));
    expect(revoked.overageCeilingUnits).toBe(0);
    expect(revoked.includedUnits).toBe(base.includedUnits);
    expect(revoked.reservePerStudentUnits).toBe(base.reservePerStudentUnits);
  });

  it('funds the same reserve whether or not overage is ever authorized', () => {
    const neverLifted = provisionAllowance({ householdId: 'h1', activeStudentCount: 2, periodStart: 0 });
    const lifted = applyOverageCeiling(
      provisionAllowance({ householdId: 'h1', activeStudentCount: 2, periodStart: 0 }),
      MAX_OVERAGE_CEILING_UNITS,
    );
    // The protected reserve — the essential-learning floor — is identical.
    expect(lifted.reservePerStudentUnits).toBe(neverLifted.reservePerStudentUnits);
    expect(lifted.includedUnits).toBe(neverLifted.includedUnits);
  });
});
