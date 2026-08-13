# Launch readiness — the gap between this code and a real pilot

The honest, specific map of what stands between the current repository and a
10–20 family pilot. It consolidates the **launch gates** from
[`mvp-specification.md`](mvp-specification.md) §18 with the cross-phase
**deferred / UNVERIFIED** items every prior phase flagged. Nothing here is
hand-waved: where a gate is not yet met, it says so.

**Status legend:** ✅ done · 🟡 built but unverified / stubbed · ⬜ not started.

> **What IS built.** All eight phases are scaffolded as pure, unit-tested domain
> logic + Firestore rules + server operations under `authorize`, with **179
> passing unit tests** (`npm run test:unit`), a clean `npx tsc --noEmit`, and clean
> `npx eslint`. The domain model, state machines, invariant enforcement in code,
> and the metadata-only pilot instrumentation are real. **What is NOT built** is
> every point of contact with the outside world — emulator-verified rules, real AI
> vendors, payment, UI, the empirical benchmark, the DR drill, accessibility
> conformance, the incident runbook, and legal review. That outside-world surface
> is the launch-readiness gap.

---

## A. Non-waivable hard gates (§18) — must ALL be green to launch

The pilot cannot start, or cannot convert to launch, until each of these is
*verified*, not merely coded. The scorecard (`src/modules/pilot/scorecard.ts`)
encodes them and short-circuits to NO-GO on any single failure.

| Hard gate | Encoded in code | Real-world status |
|-----------|-----------------|-------------------|
| ≥ 10 households × 4 active weeks on mixed curricula through the full loop | ✅ `MIN_PILOT_HOUSEHOLDS` / `MIN_ACTIVE_WEEKS` | ⬜ pilot not yet run |
| Zero unresolved sev-1 privacy/authorization/answer-key/data-loss/billing/child-safety defects | ✅ per-category gate | ⬜ requires the pilot + a defect-triage process |
| Verified household isolation | 🟡 rules + `authorize` in code | ⬜ **emulator rules tests never ran** (JDK gate, §B.1) |
| Verified consent gating | 🟡 rules + module K in code | ⬜ same JDK gate |
| Verified answer-key isolation | 🟡 rules + assembly filters in code | ⬜ same JDK gate + real ingestion (§B.2) |
| Verified deletion + export | 🟡 module K pure logic in code | ⬜ cascade executor + export worker deferred (§B.6) |
| Per-Student cost within the model, working caps | 🟡 gateway J enforcement in code | ⬜ needs the empirical benchmark (§B.3) + real metering under load |

The founder Household Owner is the launch decision-maker; the
safety/privacy/authorization/integrity/answer-key/parental-authority gates
**cannot be waived** — no documented exception may touch a hard gate.

## Target metrics (§5/§18) — may miss only with a documented, evidence-backed exception + corrective plan

Efficiency (§5: household+first Student < 5 active min · course approval < 10
active min · normal daily review < 5 active min · Review Flags within two
interactions), AI-acceptance (accept vs edit/override at the seams), independence,
and portfolio usefulness (adult-reported). The **exact numeric thresholds are
deferred** (§21) — fixed under empirical/counsel validation before the pilot. The
scorecard models these as `TargetMetric`s with a `DocumentedException` path.

---

## B. Cross-phase deferred / UNVERIFIED items (the blocking work)

### B.1 Emulator rules tests — now run in CI ✅ (local dev still JDK-gated) 🟡

**Update:** the CI `rules` job (`.github/workflows/ci.yml`) provisions Temurin JDK
21 and runs `npm run test:rules` on every push/PR — so the rules suites **now
execute and pass in-emulator**. Coverage is **both** the Phase 0 exit gate
(`tests/rules/foundation.rules.test.ts`: household isolation, role scoping,
answer-key isolation, consent-field immutability, non-writable audit) **and the
later-phase collections** (`tests/rules/later-phase.rules.test.ts`: adult-read +
isolation, owner-only, reviewer-scoped-by-studentId, parent-plus draft, and the
universal server-written / immutable posture). The **local** dev box still has
**JDK 1.8** and cannot run them (install JDK 11+ to run locally).

Historically: `npm run test:rules` boots the Firestore emulator, which **requires
JDK 11+**, so before CI these had **never executed** — the client-facing Firestore
rule matchers for *every* collection — `households`, `students`, `imports`,
`courses`, plans, `submissions`/`evidence`/`supportEvents`, `aiAssessments`/
`officialGrades`, `masteryRecords`/`remediationDrafts`, `reviewFlags`/
`notifications`, `schoolYears`/`portfolioSnapshots`/`deletionLedger`,
`subscriptions`/`overageConsents`, and the new `pilotTelemetry`/`pilotScorecard`
— are **unverified in-emulator**. The server-side `authorize` path is exercised by
unit tests and the deny-by-default posture is in the rules, but the Phase 0 exit
gate ("household isolation + fail-closed authz + consent gating pass in emulator")
is **not** provably met until JDK 11+ is installed and `tests/rules` runs green.
**This is the single most load-bearing unverified item.** Firestore composite
indexes for the current multi-field queries are declared in
`firestore.indexes.json` (see [`firestore-indexes.md`](firestore-indexes.md)); new
multi-field queries must add their index there as they land.

### B.2 Real vendor integrations (all stubbed) 🟡

- **OCR / extraction** (module B / gateway J) — `ai-gateway/providers.ts` is an
  `AIProvider` interface + `StubProvider`. Real Vertex AI / Document AI / Vision on
  approved US endpoints under an executed DPA is a deferred integration pass.
- **AI assessment** (module E) — advisory worker runs against the stub provider;
  real assessment vendor deferred.
- **Scaffolded tutor** (module D) — real tutoring vendor behind the gateway is
  deferred (stub only); hard-stops/escalation logic is built.
- **Payment processor** (module I) — `billing/processor.ts` is the interface + a
  no-op `StubProcessor`; real credentials, webhooks (invoice paid / payment failed
  → `transitionSubscription`), and usage reporting are deferred. **No card / bank /
  account credential is handled anywhere** — a hosted PCI-scoped processor takes
  payment details directly.

### B.3 Empirical ingestion benchmark run (#17) ⬜ **(pre-pilot blocking)**

Needs a rights-cleared corpus + Vertex/Document AI/Vision access to set the exact
accuracy / latency / cost thresholds and prove cost caps under load. Until it runs,
the "trustworthy draft approvable < 10 min; zero answer-key leakage; caps enforced"
exit gate for Phase 1 is asserted in code but not empirically established.

### B.4 DR restore drill (§16) ⬜ **(pre-pilot blocking)**

The DR posture is defined — daily managed backups + 7-day PITR + a
region-independent US-multiregion export, RPO ~minutes/≤24h on immutable regional
`us-east4` (99.99%, no auto-failover, knowingly chosen). The **pre-pilot restore
drill** that proves a restore actually works has **not** been performed.

### B.5 UI prototype builds (#9, #10, #11) 🟡 (first flow drafted)

Throwaway import / student / evidence prototype variations, then the real
age-adapted student experience (grades 1-3 / 4-8 / 9-12), the parent approval
queues (ingestion, grade, plan), the flag-review surface, subscription/overage
management, and the founder-facing pilot scorecard dashboard. Acceptance criteria
are fixed; the builds are not done. The reusable Next.js app shell exists; per
[`../AGENTS.md`](../AGENTS.md), read `node_modules/next/dist/docs/` before any
Next-specific code (this version has breaking changes).

**First flow drafted — the ingestion parent-approval gate** (`src/app/approvals/`):
a queue of `ExtractedDraft` imports and a review screen (draft tree with per-item
confidence + source-page provenance, quality flags, batch-eligibility) with
Approve / Request correction / Reject wired to the module-B server operations via
Server Actions. It builds, type-checks, lints clean, and reuses the real
`authorize()` gate on every read/write. **Not yet real:** (a) auth session is a
**dev stub** (`src/lib/auth/session.ts`) that hard-fails in production — real
Firebase Auth session cookies + the uid↔membership lookup are §B.6; (b) no real
worker produces `ExtractedDraft`s yet (§B.2/§B.6) — a **demo seed**
(`scripts/seed-emulator.ts`, `npm run seed`) now populates the queue so both flows
are clickable against the emulator, but that is dev scaffolding, not the pipeline;
(c) the flow has **not** been exercised end-to-end in-emulator (local JDK gate,
§B.1) — only unit/tsc/build verified, and the seed's document shapes are
type-checked against the domain types but its click-through is **unrun on this
machine** (JDK 1.8; the emulator needs 11+).

**Second flow drafted — the grade parent-approval gate** (`src/app/grades/`): a
queue of `AssessmentReady` AI assessments and a review screen rendering the full
mandatory disclosure envelope (§8: suggested score + rationale, confidence,
uncertainty/unread portions, assistance context, evidence examined, AI
provenance) with the four routing lanes (batch / individual / manual /
parent-only). The parent can **accept** the AI suggestion or **override** with
their own final score (divergence retained, suggested-vs-final preserved), wired
to `approveAssessment` via Server Actions on the same `authorize()` gate. Same
seams/caveats as the ingestion flow apply — plus one specific to display: the
routing signals `transcribed` / `flagged` / `missingEvidence` are not yet
persisted on the assessment, so the shown lane uses their default (false) until
module D/G wire them through (the server approval re-derives identically). The
plan, flag-review, billing, and scorecard surfaces remain ⬜.

### B.6 Worker / scheduler infrastructure ⬜

Cloud Run + Cloud Tasks jobs that the pure logic hands off to: the ingestion
pipeline, the assessment worker, the **deletion-cascade executor** (10 surfaces +
the ~180d backup ceiling), the **portfolio-PDF render** + export serialization
(JSON/CSV), the inactivity sweep, the billing **period-rollover scheduler**, and
overage usage reporting. Also the student-uid ↔ Student-profile linkage that
gates student-scoped reads across modules.

### B.7 Accessibility conformance ⬜

Accessibility is fixed as MVP scope, but the **specific standard** (e.g. WCAG
level) and the test plan **remain to be set** (§21). No conformance testing has
been done — there is no UI yet to test.

### B.8 Incident-response runbook + technician tooling ⬜

The controls are fixed (§12/§18: audited staff access, household-visible content
access, metadata-only technician alerts), but the concrete **runbook** and
technician tooling remain to be written. Required before real child data is in the
system.

### B.9 Counsel / legal review — COPPA + applicable state law ⬜ **(launch blocking, §15)**

The product is treated as **child-directed under COPPA** (not FERPA-positioned).
**Launch is explicitly blocked on counsel review** of COPPA + applicable state
law, and every AI/infra vendor must be under an executed **DPA** with no-training,
retention, deletion, security, and subprocessor terms, with identifiable child
content only on approved US endpoints. This review has not happened.

### B.10 Instrumentation call sites (Phase 8 tail) ⬜

The pilot module is the pure sink + content-free validator + scorecard. Emitting a
`TelemetryEvent` at each #14 approval seam and the **pseudonym salting** that
produces `householdRef` / `studentRef` from real ids are wired during the pilot
build-out. The retention wiring (telemetry ties to module K retention tiers) is
part of that pass.

### B.11 Legacy scaffold retirement ✅ **done**

The pre-wayfinder **Prisma / SQLite** scaffold has been retired: `prisma/`, the
`db:*` npm scripts + `prisma generate` postinstall, the `@prisma/client`/`prisma`
deps + `allowScripts`, the Prisma-backed dashboard/courses pages (`src/lib/db.ts`,
`src/lib/user.ts`, `src/app/actions.ts`, `src/app/courses/**`), the `DATABASE_URL`
env, and the Vercel/starter `public/` assets are all removed. The Next.js app shell
remains with a minimal placeholder landing page; the real UI is §B.5.

---

## C. Launch exclusions (out of scope — NOT gaps, §19)

For completeness, so these are never mistaken for missing work: accreditation /
operating as a school; guaranteed state compliance; official transcripts /
graduation / HS-credit certification; native mobile apps; broad publisher
integrations / authenticated crawling / curriculum reproduction; invasive
monitoring, advertising, public leaderboards, sibling comparisons; and any
automation that weakens parent authority. These are deliberately **not** built and
are not part of readiness.

---

## D. Readiness summary

| Area | State |
|------|-------|
| Domain logic (all 8 phases, pure + unit-tested) | ✅ 179 tests green, tsc + eslint clean |
| Firestore rules authored (deny-by-default, per-collection) | ✅ Phase 0 + later-phase collections verified in CI emulator |
| Metadata-only pilot instrumentation + go/no-go scorecard | ✅ built + unit-tested |
| Emulator rules run (Phase 0 exit gate) | ✅ **runs + passes in CI (JDK 21)**; local run still needs JDK 11+ |
| Real AI/OCR/tutor/payment vendors | 🟡 stubbed behind interfaces |
| Ingestion benchmark (#17) | ⬜ pre-pilot blocking |
| DR restore drill | ⬜ pre-pilot blocking |
| UI (student / parent / founder dashboards) | 🟡 ingestion + grade parent-approval flows drafted; rest ⬜ |
| Worker/scheduler infra (cascade, PDF, rollover, sweeps) | ⬜ deferred |
| Accessibility conformance standard + tests | ⬜ standard unset |
| Incident-response runbook + technician tooling | ⬜ pending |
| Counsel review (COPPA + state law) + vendor DPAs | ⬜ **launch blocking** |

**Bottom line.** The platform is fully **scaffolded** — every invariant is
expressed in tested code and every module boundary is drawn. It is **not**
pilot-ready: the JDK-gated emulator verification, the empirical ingestion
benchmark, the DR restore drill, and counsel review are the four hardest pre-pilot
blockers, and real vendors + UI + worker infrastructure are the bulk of the
remaining build. None of these can be waived by the scorecard's exception path;
the hard gates are the floor.
