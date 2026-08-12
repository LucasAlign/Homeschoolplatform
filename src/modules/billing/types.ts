// Module I — Billing & Subscription: canonical types.
// See docs/mvp-specification.md §1 (positioning/business), §12 (AI allowance,
// reserve, billing & abuse), §17 (invariants) and issue #13.
//
// The business frame: annual school-year billing near $10/month per ACTIVE
// Student, sibling discounts, FREE adult accounts. Each period funds a pooled
// household AI allowance plus a per-Student PROTECTED RESERVE (module J's
// AllowanceState) that keeps essential learning running even at an exhausted
// allowance and a $0 overage ceiling. Overage is default-$0 (a true hard cap),
// liftable only by an explicit, capped, revocable Household-Owner authorization.
//
// This module FUNDS the AllowanceState that module J enforces against — it never
// changes module J. No real payment processing happens here: a processor
// (Stripe etc.) is a deferred integration behind an interface (processor.ts),
// and NO card/bank/account credential is ever handled anywhere in this module.

import type { AllowanceState } from '../ai-gateway/types';

// ===========================================================================
// Subscription lifecycle (§1/§12)
// ===========================================================================
//
//   active → past_due → canceled        (canceled terminal)
//   active → canceled                    (owner cancels)
//   past_due → active                    (payment recovers)
// A subscription's state changes the allowance/reserve NUMBERS a period is
// provisioned with, but never severs the protected reserve (invariant 7) — that
// guarantee lives in module J and is fed here independently of overage.
export const SUBSCRIPTION_STATES = ['active', 'past_due', 'canceled'] as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

/** Allowed forward transitions (recovery from past_due is permitted). */
export const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionState, SubscriptionState[]> = {
  active: ['past_due', 'canceled'],
  // A lapsed payment can recover to active, or lapse fully to canceled.
  past_due: ['active', 'canceled'],
  // Terminal: a canceled subscription is superseded by a fresh one, not reopened.
  canceled: [],
};

/**
 * A household subscription. Server-written; the Household Owner alone manages it
 * (billing is Owner-only, §13). `activeStudentCount` is the billable unit — free
 * adult accounts never contribute. The processor's opaque customer/subscription
 * references are stored here; NO card/bank data ever is.
 */
export interface Subscription {
  id: string;
  householdId: string;
  state: SubscriptionState;
  /** Billable ACTIVE Students this period (adults are free, not counted). */
  activeStudentCount: number;
  /** School-year term length in months the annual plan bills for (default 12). */
  schoolYearMonths: number;
  /** The billing period this subscription currently funds. */
  periodStart: number;
  periodEnd: number;
  /** Opaque processor references only — never card/bank/account numbers. */
  processorCustomerRef: string | null;
  processorSubscriptionRef: string | null;
  createdAt: number;
  updatedAt: number;
}

// ===========================================================================
// Pricing (pure, unit-tested) — §1 business frame
// ===========================================================================
//
// ~$10/month per ACTIVE Student, sibling discounts, FREE adults. Prices are in
// integer cents (never floats — money is exact). Exact dollar figures are the
// launch business inputs (deferred to counsel/pricing review, §21); the named
// constants here are the tunable defaults, and the SHAPE of the calc — per-active-
// Student base, ordinal sibling discount, zero-cost adults — is the durable part.

/** Base list price per Student per month, in cents ($10.00). */
export const BASE_MONTHLY_CENTS_PER_STUDENT = 1000;

/** Default school-year term the annual plan bills for. */
export const DEFAULT_SCHOOL_YEAR_MONTHS = 12;

/**
 * Sibling discount, applied by 1-based Student ORDINAL (not a flat household
 * rate): the first Student is full price; each additional Student is discounted
 * on a tier. Basis points (10000 = 100%). Ordered high-to-low ordinal so the
 * lookup takes the deepest tier the ordinal reaches.
 */
export interface SiblingDiscountTier {
  /** Applies to this Student ordinal and every later one, until a deeper tier. */
  fromOrdinal: number;
  /** Discount in basis points off the base monthly price (0 = full price). */
  discountBps: number;
}

export const SIBLING_DISCOUNT_TIERS: readonly SiblingDiscountTier[] = [
  { fromOrdinal: 1, discountBps: 0 }, //   1st Student  — full price
  { fromOrdinal: 2, discountBps: 1500 }, // 2nd–3rd      — 15% off each
  { fromOrdinal: 4, discountBps: 2500 }, // 4th+         — 25% off each
];

/** What a price quote consumes. Adults are free; passed only to prove $0. */
export interface PricingInput {
  /** Billable ACTIVE Students in the household (1–10 per §1). */
  activeStudentCount: number;
  /** Free adult accounts (Owner/Parent Admin/Instructor) — always $0. */
  adultCount?: number;
  /** School-year term in months (default DEFAULT_SCHOOL_YEAR_MONTHS). */
  schoolYearMonths?: number;
}

/** The computed price breakdown (pure). All amounts in integer cents. */
export interface SubscriptionQuote {
  activeStudentCount: number;
  adultCount: number;
  schoolYearMonths: number;
  /** Per-Student monthly price by 1-based ordinal, after sibling discount. */
  perStudentMonthlyCents: number[];
  /** Household monthly total (sum of per-Student monthly prices). */
  monthlyTotalCents: number;
  /** Annual school-year total billed up front (monthly total × term months). */
  annualTotalCents: number;
  /** Free adult accounts, itemized as $0 for disclosure. */
  adultChargeCents: number;
}

// ===========================================================================
// Allowance provisioning (pure, unit-tested) — §12
// ===========================================================================
//
// A billing period funds module J's AllowanceState: a POOLED household included
// allowance (per-Student included units × active Students) plus a per-Student
// PROTECTED RESERVE floor. Provisioning is INDEPENDENT of overage — the reserve
// is computed from the active-Student count alone, so essential learning is
// funded even at the default $0 overage ceiling (invariant 7). Exact unit counts
// are tunable launch inputs; the constants below are sensible normalized defaults.

/** Included pooled AI cost-units funded per active Student, per period. */
export const INCLUDED_UNITS_PER_STUDENT = 1000;

/** Protected Essential reserve floor per Student, per period (module J key). */
export const RESERVE_UNITS_PER_STUDENT = 200;

/** What a provisioning consumes to produce a period's AllowanceState. */
export interface ProvisioningInput {
  householdId: string;
  /** Active Students the period funds (the pooled allowance scales with this). */
  activeStudentCount: number;
  /** Start of the billing period this allowance covers (period reset anchor). */
  periodStart: number;
  /** Override the per-Student included units (defaults to the constant). */
  includedUnitsPerStudent?: number;
  /** Override the per-Student reserve floor (defaults to the constant). */
  reserveUnitsPerStudent?: number;
}

// The AllowanceState shape is owned by module J; module I produces exactly it.
export type { AllowanceState };

// ===========================================================================
// Overage authorization (pure + audited record) — §12
// ===========================================================================
//
// Overage is a DEFAULT $0 hard cap. Lifting it is an explicit, CAPPED, REVOCABLE,
// Household-Owner-only authorization with a DISCLOSED unit price. It writes an
// audited, append-only overage-consent record (mirroring the consent/receipt
// idiom) and sets `overageCeilingUnits` on the allowance. Revocation returns the
// ceiling to $0. The ceiling is bounded by a hard maximum — an authorization can
// never be unbounded (fail-closed even when the Owner opts in).

/** Hard maximum any single overage authorization may set, in cost-units. */
export const MAX_OVERAGE_CEILING_UNITS = 10000;

export const OVERAGE_STATES = ['authorized', 'revoked'] as const;
export type OverageState = (typeof OVERAGE_STATES)[number];

/** What an overage authorization request consumes (pure validation input). */
export interface OverageAuthorizationInput {
  /** Requested ceiling in cost-units. Must be > 0 and ≤ MAX_OVERAGE_CEILING_UNITS. */
  requestedCeilingUnits: number;
  /** Disclosed price per overage cost-unit, in cents (must be disclosed, > 0). */
  disclosedUnitPriceCents: number;
}

/** The validated outcome of an overage authorization (pure). */
export interface OverageAuthorizationResult {
  valid: boolean;
  /** The ceiling that will be applied (0 when invalid or on revocation). */
  ceilingUnits: number;
  /** Content-free reason the request was rejected, when invalid. */
  reason?:
    | 'ceiling_must_be_positive'
    | 'ceiling_exceeds_max'
    | 'unit_price_must_be_disclosed';
}

/**
 * An immutable, append-only overage-consent record (mirrors ConsentReceipt). An
 * authorization and its later revocation are SEPARATE records — the ceiling state
 * is derived from the latest one. Owner-only; server-written.
 */
export interface OverageConsent {
  id: string;
  householdId: string;
  state: OverageState;
  /** The ceiling this record establishes (0 on revocation). */
  ceilingUnits: number;
  /** The disclosed per-unit price at the time of authorization, in cents. */
  disclosedUnitPriceCents: number;
  /** The Household Owner who authorized/revoked (billing is Owner-only, §13). */
  ownerUid: string;
  createdAt: number;
}
