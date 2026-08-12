// Module I — Billing & Subscription operations (server-only, Admin SDK).
//
// Subscriptions, the household allowance, and overage authorizations are
// server-written; clients never write them (Firestore rules deny it, and the
// server is the single writer). Billing and overage are HOUSEHOLD-OWNER-ONLY
// (§13) — a Parent Admin has academic authority but NOT billing authority — and
// every operation authorizes fail-closed and is audited.
//
// This module FUNDS module J's AllowanceState and never changes module J. NO
// card/bank/account credential is handled here; a real processor is a deferred
// integration behind processor.ts.

import { adminDb, FieldValue } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { recordAudit } from '../audit/audit';
import { assertSubscriptionTransition } from './subscription-state-machine';
import { provisionAllowance } from './provisioning';
import {
  applyOverageCeiling,
  revokeOverageCeiling,
  validateOverageAuthorization,
} from './overage';
import type {
  AllowanceState,
  OverageAuthorizationInput,
  OverageConsent,
  Subscription,
  SubscriptionState,
} from './types';

export class BillingError extends Error {
  constructor(reason: string) {
    super(`billing: ${reason}`);
    this.name = 'BillingError';
  }
}

function subscriptionRef(hid: string) {
  return adminDb.doc(`households/${hid}/subscriptions/current`);
}
function allowanceRef(hid: string) {
  return adminDb.doc(`households/${hid}/allowance/current`);
}
function overageConsentsCol(hid: string) {
  return adminDb.collection(`households/${hid}/overageConsents`);
}

/**
 * Activate (or re-provision) a household subscription for a billing period —
 * HOUSEHOLD-OWNER-only. Writes the subscription record AND provisions the
 * period's AllowanceState (pooled included units + per-Student protected reserve)
 * that module J enforces against. The freshly provisioned allowance starts at the
 * default $0 overage ceiling (fail-closed). Audited.
 */
export async function activateSubscription(args: {
  uid: string;
  householdId: string;
  activeStudentCount: number;
  schoolYearMonths: number;
  periodStart: number;
  periodEnd: number;
  processorCustomerRef?: string | null;
  processorSubscriptionRef?: string | null;
}): Promise<{ subscription: Subscription; allowance: AllowanceState }> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'subscription',
    action: 'write',
  });

  const now = Date.now();
  const allowance = provisionAllowance({
    householdId: args.householdId,
    activeStudentCount: args.activeStudentCount,
    periodStart: args.periodStart,
  });

  const subscription: Subscription = {
    id: 'current',
    householdId: args.householdId,
    state: 'active',
    activeStudentCount: args.activeStudentCount,
    schoolYearMonths: args.schoolYearMonths,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    processorCustomerRef: args.processorCustomerRef ?? null,
    processorSubscriptionRef: args.processorSubscriptionRef ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await adminDb.runTransaction(async (tx) => {
    tx.set(subscriptionRef(args.householdId), subscription);
    // Provisioning the reserve is INDEPENDENT of overage — essential learning is
    // funded even though the ceiling starts at $0 (invariant 7).
    tx.set(allowanceRef(args.householdId), allowance);
  });

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'write',
    recordType: 'subscription',
    recordId: subscription.id,
    detail: `subscription active; students=${args.activeStudentCount}; allowance provisioned included=${allowance.includedUnits} reservePerStudent=${allowance.reservePerStudentUnits} overageCeiling=0`,
  });

  return { subscription, allowance };
}

/**
 * Transition a subscription's lifecycle state (active ↔ past_due, → canceled) —
 * HOUSEHOLD-OWNER-only, forward-only per the state machine. Billing state changes
 * the funding numbers, never the protected-reserve guarantee (invariant 7).
 * Audited.
 */
export async function transitionSubscription(args: {
  uid: string;
  householdId: string;
  to: SubscriptionState;
}): Promise<Subscription> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'subscription',
    action: 'write',
  });

  return adminDb.runTransaction(async (tx) => {
    const ref = subscriptionRef(args.householdId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new BillingError('no subscription to transition');
    const sub = snap.data() as Subscription;

    assertSubscriptionTransition(sub.state, args.to);

    const now = Date.now();
    tx.update(ref, { state: args.to, updatedAt: FieldValue.serverTimestamp() });
    return { ...sub, state: args.to, updatedAt: now };
  }).then(async (updated) => {
    await recordAudit({
      householdId: args.householdId,
      actorUid: args.uid,
      action: 'write',
      recordType: 'subscription',
      recordId: updated.id,
      detail: `subscription -> ${updated.state}`,
    });
    return updated;
  });
}

/**
 * Authorize overage — HOUSEHOLD-OWNER-only. Validates the request purely
 * (default $0, positive, within the hard max, price disclosed), writes an
 * immutable, append-only overage-consent record, and lifts the allowance's
 * `overageCeilingUnits`. The included allowance and protected reserve are NOT
 * touched (reserve independence). Audited with the disclosed price.
 */
export async function authorizeOverage(args: {
  uid: string;
  householdId: string;
  input: OverageAuthorizationInput;
}): Promise<{ consent: OverageConsent; allowance: AllowanceState }> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'overage',
    action: 'approve',
  });

  const validation = validateOverageAuthorization(args.input);
  if (!validation.valid) {
    throw new BillingError(`overage authorization rejected: ${validation.reason}`);
  }

  const consentRef = overageConsentsCol(args.householdId).doc();
  const consent: OverageConsent = {
    id: consentRef.id,
    householdId: args.householdId,
    state: 'authorized',
    ceilingUnits: validation.ceilingUnits,
    disclosedUnitPriceCents: args.input.disclosedUnitPriceCents,
    ownerUid: args.uid,
    createdAt: Date.now(),
  };

  const allowance = await adminDb.runTransaction(async (tx) => {
    const aRef = allowanceRef(args.householdId);
    const aSnap = await tx.get(aRef);
    if (!aSnap.exists) throw new BillingError('no allowance to authorize overage against');
    const state = aSnap.data() as AllowanceState;

    const next = applyOverageCeiling(state, validation.ceilingUnits);
    tx.create(consentRef, consent); // append-only receipt (immutable)
    tx.set(aRef, next);
    return next;
  });

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'approve',
    recordType: 'overage',
    recordId: consent.id,
    detail: `overage authorized: ceiling=${consent.ceilingUnits} units @ ${consent.disclosedUnitPriceCents}c/unit (reserve unchanged)`,
  });

  return { consent, allowance };
}

/**
 * Revoke overage — HOUSEHOLD-OWNER-only. Returns the ceiling to the $0 hard-cap
 * default, writes an immutable revocation record, and leaves the included
 * allowance + protected reserve untouched. Forward-only and audited.
 */
export async function revokeOverage(args: {
  uid: string;
  householdId: string;
}): Promise<{ consent: OverageConsent; allowance: AllowanceState }> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'overage',
    action: 'approve',
  });

  const consentRef = overageConsentsCol(args.householdId).doc();
  const consent: OverageConsent = {
    id: consentRef.id,
    householdId: args.householdId,
    state: 'revoked',
    ceilingUnits: 0,
    disclosedUnitPriceCents: 0,
    ownerUid: args.uid,
    createdAt: Date.now(),
  };

  const allowance = await adminDb.runTransaction(async (tx) => {
    const aRef = allowanceRef(args.householdId);
    const aSnap = await tx.get(aRef);
    if (!aSnap.exists) throw new BillingError('no allowance to revoke overage against');
    const state = aSnap.data() as AllowanceState;

    const next = revokeOverageCeiling(state);
    tx.create(consentRef, consent);
    tx.set(aRef, next);
    return next;
  });

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'approve',
    recordType: 'overage',
    recordId: consent.id,
    detail: 'overage revoked: ceiling -> $0 (reserve unchanged)',
  });

  return { consent, allowance };
}
