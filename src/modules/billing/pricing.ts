// Module I — Subscription pricing (pure logic, unit-tested).
// docs/mvp-specification.md §1 (business frame). No I/O, deterministic, and money
// is always integer cents — never floats.
//
// The shape of the calc is the durable part: a per-ACTIVE-Student base price, an
// ordinal SIBLING DISCOUNT (the first Student is full price; each additional one
// is discounted on a tier), and FREE adult accounts (always $0). Exact dollar
// figures are launch business inputs (deferred, §21); the constants in types.ts
// are the tunable defaults.

import {
  BASE_MONTHLY_CENTS_PER_STUDENT,
  DEFAULT_SCHOOL_YEAR_MONTHS,
  SIBLING_DISCOUNT_TIERS,
  type PricingInput,
  type SubscriptionQuote,
} from './types';

export class PricingError extends Error {
  constructor(reason: string) {
    super(`pricing: ${reason}`);
    this.name = 'PricingError';
  }
}

/**
 * The sibling-discount basis points for a 1-based Student ordinal: the deepest
 * tier whose `fromOrdinal` the ordinal has reached. Pure lookup over the ordered
 * tier table.
 */
export function discountBpsForOrdinal(ordinal: number): number {
  let bps = 0;
  for (const tier of SIBLING_DISCOUNT_TIERS) {
    if (ordinal >= tier.fromOrdinal) bps = tier.discountBps;
  }
  return bps;
}

/** The discounted monthly price (cents) for one Student at a given ordinal. */
export function perStudentMonthlyCents(ordinal: number): number {
  const bps = discountBpsForOrdinal(ordinal);
  // Round to the nearest cent; basis points keep the discount exact-ish and the
  // single rounding here is the only place a fraction of a cent is resolved.
  return Math.round((BASE_MONTHLY_CENTS_PER_STUDENT * (10000 - bps)) / 10000);
}

/**
 * Compute a subscription price quote. Per-active-Student base with an ordinal
 * sibling discount; adults are itemized at $0 (free accounts). The annual total
 * is the household monthly total billed up front for the school-year term.
 */
export function computeSubscriptionQuote(input: PricingInput): SubscriptionQuote {
  const count = input.activeStudentCount;
  if (!Number.isInteger(count) || count < 0) {
    throw new PricingError('activeStudentCount must be a non-negative integer');
  }
  const adultCount = input.adultCount ?? 0;
  if (!Number.isInteger(adultCount) || adultCount < 0) {
    throw new PricingError('adultCount must be a non-negative integer');
  }
  const schoolYearMonths = input.schoolYearMonths ?? DEFAULT_SCHOOL_YEAR_MONTHS;
  if (!Number.isInteger(schoolYearMonths) || schoolYearMonths <= 0) {
    throw new PricingError('schoolYearMonths must be a positive integer');
  }

  const perStudent: number[] = [];
  for (let ordinal = 1; ordinal <= count; ordinal++) {
    perStudent.push(perStudentMonthlyCents(ordinal));
  }
  const monthlyTotalCents = perStudent.reduce((sum, c) => sum + c, 0);

  return {
    activeStudentCount: count,
    adultCount,
    schoolYearMonths,
    perStudentMonthlyCents: perStudent,
    monthlyTotalCents,
    annualTotalCents: monthlyTotalCents * schoolYearMonths,
    // Free adult accounts (§1): never a charge, itemized as $0 for disclosure.
    adultChargeCents: 0,
  };
}
