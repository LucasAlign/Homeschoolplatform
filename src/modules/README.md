# Modules

Bounded modules from [`docs/mvp-specification.md`](../../docs/mvp-specification.md) §4.
Each canonical entity has exactly one owning module (single writer); other
modules reference by opaque id. All AI calls route through module J; every
sensitive server access calls `identity/authorize` first (fail-closed).

| Module | Dir | Status |
|--------|-----|--------|
| A. Identity & Access | `identity/` | 🚧 Phase 0 — roles, capability matrix, `authorize()` |
| K. Consent, Retention & Deletion | `consent/` | 🚧 Phase 0 + Phase 6 — consent state machine + collection gate; retention-tier classification, cascading deletion-plan + content-free ledger, immutability-vs-deletion rule, household-scoped adult-separated export |
| L. Audit & Access Log | `audit/` | 🚧 Phase 0 — append-only audit writer |
| B. Curriculum Ingestion | _(Phase 1)_ | ⬜ |
| C. Planning & Scheduling | _(Phase 2)_ | ⬜ |
| D. Daily Work & Submission | `daily-work/` | 🚧 Phase 3 — submission machine, Evidence Policy, offline queue, scaffolded tutor |
| E. Assessment & Grading | `assessment/` | 🚧 Phase 4 — assessment worker, disclosure gate, grade-approval routing, immutable Official Grade + supersession |
| F. Mastery & Adaptation | `mastery/` | 🚧 Phase 4 — Mastery lifecycle + canonical scale, multi-signal adaptation gating |
| G. Review & Notifications | `review/` | 🚧 Phase 5 — Review Flag lifecycle, neutral evidence-backed signal classification (no surveillance), notification-tier routing, daily-queue/weekly-digest aggregation |
| H. Records & Portfolio | `records/` | 🚧 Phase 6 — School-Year completion (Owner-only, gated), immutable self-contained Portfolio Snapshot with answer-key/adult-content exclusion filter + reopen supersession |
| I. Billing & Subscription | `billing/` | 🚧 Phase 7 — annual school-year subscription state machine, pricing (per-active-Student base + ordinal sibling discount + free adults), allowance provisioning (funds module J's `AllowanceState`: pooled included units + per-Student protected reserve + period reset), overage authorization (default $0 hard cap, capped/revocable Owner-only consent → $0); reserve funding independent of overage; deferred payment-processor interface (no card/bank credentials) |
| J. AI Policy Gateway & Metering | `ai-gateway/` | 🚧 Phase 1 — fail-closed enforcement ladder, per-Student metering, cost classes + protected reserve |
| —. Pilot Readiness & Launch (cross-cutting) | `pilot/` | 🚧 Phase 8 — metadata-only telemetry (`TelemetryEvent` content-free by construction + `assertMetadataOnly` validator), metric-family aggregation with small-cohort suppression, and the go/no-go scorecard (non-waivable hard gates short-circuit to NO-GO; targets waivable only by a documented evidence-backed exception). See [`docs/launch-readiness.md`](../../docs/launch-readiness.md) |

**Canonical contract:** async produces drafts, adults produce truth — a parent
gate always stands between an async AI result and student-visible or
record-of-truth state.
