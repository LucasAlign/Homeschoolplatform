# Phase 8 — Pilot Readiness & Launch (cross-cutting)

The final phase. **Privacy-preserving instrumentation** for the four-week pilot
and the **go/no-go acceptance scorecard** that decides launch — plus
[`launch-readiness.md`](launch-readiness.md), the honest consolidated map of
everything that still stands between this code and a real pilot. Source of truth:
[`mvp-specification.md`](mvp-specification.md) §18 (pilot instrumentation &
acceptance scorecard), §15 (child-privacy telemetry constraints), §5 (efficiency
gates), §16 (region/DR/availability), §17 (invariants), §19 (launch exclusions),
§20 (Phase 8 row + exit gate).

The pilot is measured **only from metadata and adult-reported signals at the #14
approval seams** — never Student content or PII. Telemetry follows the SAME
content-free ethos as the audit log (module L): it records WHAT happened, WHEN,
HOW MANY, HOW MUCH it cost, and the OUTCOME — never the record's content. The
`TelemetryEvent` shape is closed by construction and a pure validator rejects any
disallowed field, so **content can never enter telemetry**. This phase adds no
vendor, no worker, and no UI; it is framework-agnostic TypeScript + checklist
docs.

## What this phase ships

### Module — Pilot Readiness & Launch — `src/modules/pilot/`

- `types.ts` — the metric families (`efficiency`, `ingestion`, `ai_acceptance`,
  `independence`, `cost`, `safety`, `portfolio`) mapped to the §5/§18 gates; the
  `TelemetryEvent` shape (pseudonymous `householdRef`/`studentRef`, an operation
  naming a #14 approval seam, an approval/operation outcome, timings, counts,
  cost-units, sev-1 category/resolution, adult-reported usefulness — and
  deliberately **no** content/PII field); the `ALLOWED_TELEMETRY_KEYS` allowlist
  and `DISALLOWED_KEY_SUBSTRINGS` denylist that make the content-free rule
  runtime-testable; the `MetricAggregate` roll-up shape; and the scorecard shapes
  — `HardGateInputs`, `TargetMetric`, `DocumentedException`, `Scorecard` — with
  the launch minimums (`MIN_PILOT_HOUSEHOLDS = 10`, `MIN_ACTIVE_WEEKS = 4`) and
  the non-waivable `SEV1_CATEGORIES`.
- `telemetry-validation.ts` — **pure, unit-tested** `assertMetadataOnly` (the HARD
  rule): fail-closed guard rejecting any key outside the allowlist, any
  content/PII-suggestive key, and any `householdRef`/`studentRef` that reads like a
  raw id or an email (a real id/address is itself PII). `isMetadataOnly` is the
  boolean wrapper. This is the runtime half of "content can never enter
  telemetry"; the type is the compile-time half.
- `metrics.ts` — **pure, unit-tested** aggregation: `aggregateFamily` /
  `aggregateAll` roll many events into per-family rates and means; direction-aware
  and divide-by-zero-safe. Small-cohort results are **not** re-identifiable —
  `isAggregatePublishable` withholds an aggregate below `MIN_AGGREGATION_COHORT`
  distinct households (§18).
- `scorecard.ts` — **pure, unit-tested** `evaluateScorecard`: the launch decision.
  **Hard gates** (≥10 households × 4 active weeks; zero unresolved sev-1
  privacy/authorization/answer-key/data-loss/billing/child-safety defects;
  verified isolation/consent/answer-key/deletion-export; per-Student cost within
  the model) **short-circuit to NO-GO** on any single failure and can **never** be
  waived. **Target metrics** (efficiency, AI-acceptance, independence, portfolio)
  may miss only via a `DocumentedException` that cites evidence, carries a
  corrective plan, and is approved by the founder Household Owner — otherwise a
  miss is NO-GO. `targetMeetsThreshold` / `isValidException` are the pure building
  blocks.
- `pilot.ts` — operations (server-only, Admin SDK): `recordTelemetry` runs
  `assertMetadataOnly` **before** the append-only write (a non-content-free payload
  throws and nothing persists); `evaluateAndWriteScorecard` is **Owner-only** via
  `authorize` (the founder is the launch decision-maker, §18), persists the result,
  and audits the DECISION only (content-free).

### Wiring

- `src/modules/identity/roles.ts` — adds `pilot_telemetry` (Owner-read) and
  `pilot_scorecard` (Owner read + approve) record types to the capability matrix.
- `firestore.rules` — adds server-written, Owner-read, **deny-client-write**
  `pilotTelemetry` / `pilotScorecard` collections; deny-by-default preserved.

## Invariants upheld

- **Household isolation (1):** telemetry and the scorecard are pinned under
  `households/{hid}/…`; rules re-check Owner membership; ops re-derive it via
  `authorize`.
- **Child-privacy telemetry (§15/§18):** metadata-only by construction AND by the
  runtime validator — pseudonymous ids, timings, counts, cost, outcomes; never
  Student content, PII, evidence/submission bodies, answer-key material, or raw AI
  prompts/outputs. Small cohorts are not re-identifiable.
- **Fail-closed authz (3):** writing the scorecard authorizes first and is
  **Owner-only**; telemetry has no client write path at all.
- **No solely-automated consequential decision (4):** the scorecard is advisory
  input; the founder Household Owner makes the launch call. The
  safety/privacy/authorization/integrity/answer-key/parental-authority gates
  **cannot be waived** — no documented exception may touch a hard gate.
- **Immutable audit (9):** each scorecard evaluation writes a content-free audit
  event (GO/NO-GO + blocking-reason count); telemetry events are append-only.

## Verify (no emulator / JDK needed)

```bash
npm run test:unit      # 179 tests total; 23 are Phase 8
                       #   pilot.test.ts (23) — pilot module:
                       #     assertMetadataOnly content-free guarantee (allowlist +
                       #     denylist + pseudonym/raw-id/email rejection), metric
                       #     aggregation (per-family rates/means, empty-safe,
                       #     small-cohort suppression), and scorecard evaluation
                       #     (hard-gate short-circuit, each sev-1 category + each
                       #     verification flag, target thresholding by direction,
                       #     documented-exception waiver, and the proof a hard gate
                       #     can NEVER be waived)
```

`npx tsc --noEmit` is clean; `npx eslint src/modules/pilot tests/unit/pilot.test.ts`
is clean.

## Not verified here (JDK-gated)

- `npm run test:rules` requires the Firestore emulator (JDK 11+); this machine has
  **JDK 1.8**, so the new `pilotTelemetry` / `pilotScorecard` client-facing rule
  matchers are **not** proven in-emulator this phase. Their server-side
  authorization and the deny-client-write posture are exercised by the code path,
  but the rules remain unverified until the emulator can run. This is the same
  JDK gate every prior phase flagged — see [`launch-readiness.md`](launch-readiness.md).

## Deferred

- **Instrumentation call sites** — the pilot module is the pure sink + validator +
  scorecard; emitting a `TelemetryEvent` at each #14 approval seam (ingestion /
  plan / grade / mastery approve, flag resolve, daily review) and the pseudonym
  salting that produces `householdRef`/`studentRef` are wired during the pilot
  build-out.
- **Exact target percentages** — the efficiency/AI-acceptance/independence/
  portfolio thresholds (§5/§18) and the retention day-counts (§15) are tunable
  inputs fixed under empirical/counsel validation (§21). The **shape** of the
  scorecard (non-waivable hard gates + exception-gated targets) is the durable part
  this phase owns.
- **The launch-readiness gaps themselves** — the emulator rules run, real vendor
  integrations, UI, the ingestion benchmark, the DR restore drill, accessibility
  conformance, the incident-response runbook, and counsel/legal review — are
  consolidated and tracked in [`launch-readiness.md`](launch-readiness.md).
- Pilot-telemetry aggregation **UI / export** (the founder-facing scorecard and
  cohort dashboards).
- Firestore composite indexes for the new collections — declared when the
  emulator/index config lands.
