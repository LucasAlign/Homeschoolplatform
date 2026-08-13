# Lucas Align Homeschool — Build Roadmap

A curriculum-first homeschool **coordination** platform for US households (1–10 students, grades 1–12).
A homeschool **aid** — not an online school, publisher, accredited institution, or state-compliance guarantee.

**Stack:** Next.js (App Router) PWA + TypeScript on **Firebase** (App Hosting, Auth, App Check,
Firestore, Cloud Storage, Cloud Functions, **Cloud Run** for long OCR/AI/PDF jobs, Cloud Tasks,
Secret Manager, Cloud Messaging). Region: **`us-east4`** (immutable, US-only child-data residency).

> **Source of truth:** [`docs/mvp-specification.md`](docs/mvp-specification.md) — the consolidated MVP
> specification synthesizing the 17 approved wayfinder decisions (GitHub issues #2–#18 under map #1).
> This roadmap is the phase-level view of that spec.

The non-negotiable MVP loop:

> **Import → AI extraction → parent approval → student checklist → evidence submission → parent review**

## Phases

| Phase | Name | Ships | Modules | Status |
|-------|------|-------|---------|--------|
| **0** | Foundation | Firebase project in `us-east4`; Auth, App Check, Firestore, Storage; IAM + server-side fail-closed authorization; Household + roles; consent gate; audit log. Replaces the legacy Prisma/SQLite scaffold. | A, K(min), L | 🚧 Scaffolded — exit-gate rules tests need JDK 11+ to run |
| **1** | Curriculum Ingestion *(MVP core)* | Import → page-chunked OCR → multimodal extraction → parent-approved Course draft; answer-key isolation; AI policy gateway + per-Student metering + cost caps | B, J | 🚧 In progress — state machine, gateway & metering built + unit-tested; real OCR/vendor + UI pending |
| **2** | Planning & Scheduling | Proposed Schedule → immutable Plan Revision → Approved Plan; School Calendar; bounded deferral/reflow | C | 🚧 In progress — planning logic, immutable revisions & optimistic-concurrency approval built + unit-tested; calendar UI pending |
| **3** | Daily Work & Submission | Age-adapted student experience (1-3 / 4-8 / 9-12); Evidence capture; offline PWA queue; scaffolded tutor + Support Events | D | 🚧 In progress — Submission state machine (Assigned→Submitted), Evidence Policy, offline-queue reconciliation, and scaffolded-tutor hard-stops/escalation built + unit-tested; age-adapted student UI + real assessment hand-off (module E) pending |
| **4** | Assessment & Grading | Advisory AI Assessment + disclosure envelope; parent approval queue; immutable Official Grade; Mastery Records | E, F | 🚧 In progress — assessment worker (advisory AI Assessment via gateway J), assessability + disclosure gate, grade-approval routing (batch/individual/manual), immutable Official Grade with supersession + parent override, Mastery lifecycle, and multi-signal adaptation gating built + unit-tested; approval-queue UI + real vendor + emulator-verified rules pending |
| **5** | Review & Notifications | Neutral evidence-backed Review Flags; immediate / daily / weekly cadences | G | 🚧 In progress — Review Flag lifecycle (Raised→Notified→Reviewed→Resolved), neutral signal classification (evidence-backed, threshold-gated, no surveillance), the "never blocks learning" + neutrality guarantees, notification-tier routing, and daily-queue/weekly-digest aggregation built + unit-tested; adult-only resolve via authorize; real signal-producer wiring + delivery channel + flag-review UI + emulator-verified rules pending |
| **6** | Records & Portfolio | School-Year completion; immutable Portfolio Snapshot; consent/retention/deletion/export lifecycle | H, K(full) | 🚧 In progress — School-Year completion (Owner-only, gated on terminal assignments / no pending assessment / no unresolved flag, or acknowledged Partial), immutable self-contained Portfolio Snapshot with the answer-key/adult-content exclusion filter + reopen supersession, retention-tier classification, cascading deletion-plan generation (10 surfaces + honest ~180d backup ceiling + content-free ledger + legal-hold override), immutability-vs-deletion rule, and household-scoped adult-separated export built + unit-tested; deletion-cascade executor + portfolio-PDF render + inactivity sweep + UI + emulator-verified rules pending |
| **7** | Billing & Subscription | ~$10/mo per active Student; included allowance + protected reserve; $0-default parent-capped overage | I | 🚧 In progress — annual school-year subscription state machine (active↔past_due→canceled), pricing (per-active-Student base + ordinal sibling discount + free adults, integer cents), allowance provisioning producing module J's `AllowanceState` (pooled included units + per-Student protected reserve + period reset), and overage authorization (default $0 hard cap, capped/revocable Owner-only consent, revoke→$0) built + unit-tested; reserve funding is independent of overage (invariant 7). Owner-only ops audited; server-written `subscriptions`/`overageConsents` rules added. Real payment processor + period-rollover scheduler + UI + emulator-verified rules pending |
| **8** | Pilot Readiness & Launch | Privacy-preserving instrumentation; DR restore drill; ingestion benchmark run; accessibility conformance; security/legal launch gates → founder household → 10–20 family pilot | all | 🚧 Scaffolded — metadata-only telemetry (`TelemetryEvent` content-free by construction + `assertMetadataOnly` validator), metric-family aggregation with small-cohort suppression, and the go/no-go scorecard (non-waivable hard gates short-circuit to NO-GO; target metrics waivable only by a documented, evidence-backed exception with a corrective plan) built + unit-tested; Owner-only scorecard op audited; server-written `pilotTelemetry`/`pilotScorecard` rules added. Instrumentation call sites + pseudonym salting, and the launch gates themselves — emulator rules run (JDK 11+), real vendors, UI, ingestion benchmark, DR restore drill, accessibility conformance, incident runbook, counsel/COPPA review — are consolidated in [`docs/launch-readiness.md`](docs/launch-readiness.md) |

Exit gates for each phase are defined in [`docs/mvp-specification.md` §20](docs/mvp-specification.md).

> **All 8 phases are now scaffolded** — every module boundary is drawn and every non-waivable
> invariant is expressed in pure, unit-tested code (**179 unit tests**, `npx tsc --noEmit` and
> `npx eslint` clean). What remains before a real pilot is the outside-world surface — the
> JDK-gated emulator rules run, real AI/OCR/tutor/payment vendors, UI, the empirical ingestion
> benchmark, the DR restore drill, accessibility conformance, the incident-response runbook, and
> counsel/COPPA review. That gap is mapped honestly in
> [`docs/launch-readiness.md`](docs/launch-readiness.md).

## Architecture (target)

**9 domain modules** — A. Identity & Access · B. Curriculum Ingestion · C. Planning & Scheduling ·
D. Daily Work & Submission · E. Assessment & Grading · F. Mastery & Adaptation · G. Review &
Notifications · H. Records & Portfolio · I. Billing & Subscription.
**3 cross-cutting platform modules** — J. AI Policy Gateway & Metering · K. Consent, Retention &
Deletion · L. Audit & Access Log.

Canonical contract: **async produces drafts, adults produce truth** — a parent gate always stands
between an async AI result and student-visible or record-of-truth state. See the spec for the
canonical state machines and the ten non-waivable invariants.

## Domain model (canonical — `CONTEXT.md`)

- **Household** — family-level aggregate root owning students, memberships, subscriptions, records, school years. **Household Owner** has final authority (billing, consent, roles, School-Year completion).
- **Parent Admin** — full academic authority (approve curriculum, requirements, grades, plans). **Instructor Reviewer** — scoped, advisory unless explicitly elevated. **Student** — own-scope work only.
- **Curriculum Source → Course → Lesson → Assignment** — imported material adopted for a Student in a School Year, producing scheduled work.
- **Proposed Schedule → Plan Revision → Approved Plan** — advisory placement materialized into immutable, effective-dated revisions on parent approval.
- **Evidence / Submission / Support Event** — proof of work, the student's attempt, and logged assistance.
- **AI Assessment (advisory) → Official Grade (parent-approved, immutable)** — suggested vs final; supersession on resubmission.
- **Mastery Record** — parent-confirmed proficiency. **Review Flag** — neutral request for adult attention.
- **School Year → Portfolio Snapshot** — reporting period frozen into an immutable, parent-approved, self-contained record (not an accredited transcript).

## Local development

Next.js PWA against the **Firebase Emulator Suite** (Auth, Firestore, Storage, Functions), with
Cloud Run workers for OCR/AI/PDF jobs. The legacy Prisma/SQLite scaffold has been retired.

```bash
npm install
cp .env.example .env.local   # fill Firebase web config; keep the emulator flag "true" for local
npm run dev                  # start the Next.js app on http://localhost:3000
npm run emulators            # Auth + Firestore + Storage + Functions + UI (http://127.0.0.1:4000)
npm run test:unit            # 179 pure-logic unit tests (no emulator/JDK needed)
npm run test:rules           # emulator rules tests — requires JDK 11+
```

## Non-negotiables

Verified parental consent (COPPA); no shared-model training on student work; answer-key isolation;
parent authority over requirements and Official Grades; household isolation; data export/deletion;
protected educational reserve so essential learning never stops; no surveillance (no webcams,
keylogging, background recording, covert tracking); no public leaderboards or sibling comparisons.
