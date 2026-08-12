# Phase 7 — Billing & Subscription (module I)

Annual school-year subscription, **allowance funding**, and **overage
consent/ceilings**. The business frame: near **$10/month per active Student**,
**sibling discounts**, **free adult accounts**; each period funds a pooled
household AI allowance plus a per-Student **protected reserve**, and overage is a
**default $0 hard cap** liftable only by explicit, capped, revocable
Household-Owner consent. Source of truth:
[`mvp-specification.md`](mvp-specification.md) §1 (positioning/business), §12 (AI
allowance, reserve, billing & abuse), §17 (invariants), §20 (Phase 7 exit gate).

Module I **FUNDS** the `AllowanceState` that module J (AI Policy Gateway &
Metering) already enforces against — it produces exactly J's shape and **never
changes J**. Billing and overage are **Household-Owner-only** lifecycle acts
(§13) — never solely automated, always audited. **No real payment is processed**:
a processor (Stripe etc.) is a deferred integration behind an interface, and **no
card / bank / account credential is handled anywhere** in this module.

## What this phase ships

### Module I — `src/modules/billing/`

- `types.ts` — the `SubscriptionState` machine (`active → past_due | canceled`,
  `past_due → active`), the `Subscription` record (billable **active-Student**
  count, opaque processor references only), the pricing shapes + tunable constants
  (`BASE_MONTHLY_CENTS_PER_STUDENT`, ordinal `SIBLING_DISCOUNT_TIERS`), the
  provisioning shapes + funding constants (`INCLUDED_UNITS_PER_STUDENT`,
  `RESERVE_UNITS_PER_STUDENT`), and the overage authorization / append-only
  `OverageConsent` shapes with the hard `MAX_OVERAGE_CEILING_UNITS`. Re-exports
  module J's `AllowanceState` — the shape provisioning must produce exactly.
- `subscription-state-machine.ts` — **pure, unit-tested** strict, mostly-forward
  machine (`canceled` terminal); `canTransition` / `assert` / `isTerminal`.
- `pricing.ts` — **pure, unit-tested** `computeSubscriptionQuote`: per-**active**-
  Student base price, an **ordinal sibling discount** (first Student full price;
  each additional discounted on a tier), and **free adults** ($0, whatever the
  count). Money is always integer cents. `discountBpsForOrdinal` /
  `perStudentMonthlyCents` are the pure building blocks.
- `provisioning.ts` — **pure, unit-tested** `provisionAllowance`: pooled included
  units (per-Student × active Students) + the per-Student **protected reserve**
  floor, usage counters zeroed (period reset), and the overage ceiling **starting
  at the $0 default** (fail-closed). The reserve is derived from the Student count
  **alone** — independent of overage (invariant 7). `resetPeriodAllowance` rolls a
  new period.
- `overage.ts` — **pure, unit-tested** `validateOverageAuthorization` (default $0;
  positive; within the hard max; per-unit price disclosed — else a $0 ceiling),
  `applyOverageCeiling` (sets **only** `overageCeilingUnits`, refuses out-of-bounds
  values even on opt-in), and `revokeOverageCeiling` (ceiling → **$0**). Neither
  apply nor revoke touches the included allowance or the reserve.
- `processor.ts` — the deferred **payment-processor interface** + a `StubProcessor`
  (mirrors `ai-gateway/providers.ts`). Deals **only in opaque processor
  references** — the hosted, PCI-scoped processor takes payment details directly;
  this platform handles **no** card/bank/account credential. `getProcessor` /
  `setProcessor` wire the real one during a later integration pass.
- `billing.ts` — operations (server-only, Admin SDK), all **Owner-only** via
  `authorize` and audited:
  - `activateSubscription` — writes the subscription **and** provisions the
    period's `AllowanceState` (included units + per-Student reserve; $0 overage).
  - `transitionSubscription` — forward-only lifecycle move per the state machine.
  - `authorizeOverage` — validates, writes an **immutable, append-only**
    overage-consent record, and lifts `overageCeilingUnits`; the included allowance
    + reserve are **untouched** (reserve independence).
  - `revokeOverage` — returns the ceiling to **$0**, writes a revocation record.

## Cross-cutting changes

- `identity/roles.ts` — added `subscription` and `overage` record types.
  Subscription is **Household-Owner-only** (`read`/`write`); overage is
  **Owner-only** with `approve` as the authorizing act (mirrors consent). A Parent
  Admin has academic authority but **not** billing authority, so it gets no access
  to either.
- `firestore.rules` — added server-written, **deny-client-write**, **Owner-read**
  `subscriptions` and `overageConsents` (overage consents are append-only
  immutable receipts). The `allowance` collection already existed (Owner-read,
  server-write); its comment now notes module I funds it. Household isolation,
  answer-key isolation, and deny-by-default preserved.

## Invariants enforced

- **Household isolation (1):** billing records live under `households/{hid}`;
  rules re-check membership; every op re-derives membership via `authorize`.
- **Fail-closed authz (3):** every billing/overage operation authorizes first;
  activation, transition, authorize-overage, and revoke are all **Owner-only**.
- **No solely-automated consequential decision (4):** lifting the $0 overage cap
  is an explicit Owner authorization with a disclosed price; nothing charges or
  lifts a cap automatically.
- **Essential learning never severed (7):** the protected reserve is provisioned
  from the active-Student count **independently of overage** — funded even at the
  default $0 ceiling and unchanged when overage is lifted or revoked. Enforcement
  of that reserve remains module J's; module I only funds it.
- **Immutable audit (9):** activation, transition, overage authorization, and
  revocation each write an audit event; overage consents are append-only records.

## Verify (no emulator / JDK needed)

```bash
npm run test:unit      # 156 tests total; 23 are Phase 7
                       #   billing.test.ts (23) — module I:
                       #     subscription state machine, pricing (per-active-Student
                       #     + sibling discount + free adults), allowance provisioning
                       #     (valid AllowanceState + period reset), overage validation
                       #     (default $0, hard-cap, revoke → $0), reserve independence
```

`npx tsc --noEmit` is clean; `npx eslint src/modules/billing tests/unit/billing.test.ts
src/modules/identity/roles.ts` is clean.

## Not verified here (JDK-gated)

- `npm run test:rules` requires the Firestore emulator (JDK 11+); this machine has
  **JDK 1.8**, so the new `subscriptions` / `overageConsents` client-facing rule
  matchers are **not** proven in-emulator this phase. Their server-side
  authorization and the deny-client-write posture are exercised by the code path,
  but the rules remain unverified until the emulator can run.

## Deferred

- The **real payment processor** (Stripe etc.) — `processor.ts` is the interface +
  a no-op stub; wiring real credentials, webhooks (invoice paid / payment failed →
  `transitionSubscription`), and usage reporting is a deferred integration pass. No
  card/bank/account credential is ever handled by this platform.
- The **period-rollover scheduler** — `resetPeriodAllowance` is the pure period
  resolver; the scheduled sweep that re-provisions each household at its
  school-year boundary is deferred with the worker infrastructure.
- **Overage metering back to invoicing** — module J meters `overageUsedUnits` onto
  the allowance; reporting that consumption to the processor for the next invoice
  (`reportOverageUsage`) is deferred with the real processor.
- Exact **dollar figures and unit counts** — the base price, sibling-discount
  tiers, included-unit and reserve funding, and the overage hard max are tunable
  named constants; the launch figures are fixed under pricing/counsel review (§21).
  The **shape** of the calc (per-active-Student base, ordinal sibling discount,
  free adults, overage-independent reserve) is the durable part this phase owns.
- Billing/overage **UI** (subscription management, the overage-consent surface).
- Firestore composite indexes for the new collections — declared when the
  emulator/index config lands.
