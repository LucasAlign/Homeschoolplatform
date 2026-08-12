# Modules

Bounded modules from [`docs/mvp-specification.md`](../../docs/mvp-specification.md) §4.
Each canonical entity has exactly one owning module (single writer); other
modules reference by opaque id. All AI calls route through module J; every
sensitive server access calls `identity/authorize` first (fail-closed).

| Module | Dir | Status |
|--------|-----|--------|
| A. Identity & Access | `identity/` | 🚧 Phase 0 — roles, capability matrix, `authorize()` |
| K. Consent, Retention & Deletion | `consent/` | 🚧 Phase 0 — consent state machine + collection gate |
| L. Audit & Access Log | `audit/` | 🚧 Phase 0 — append-only audit writer |
| B. Curriculum Ingestion | _(Phase 1)_ | ⬜ |
| C. Planning & Scheduling | _(Phase 2)_ | ⬜ |
| D. Daily Work & Submission | `daily-work/` | 🚧 Phase 3 — submission machine, Evidence Policy, offline queue, scaffolded tutor |
| E. Assessment & Grading | _(Phase 4)_ | ⬜ |
| F. Mastery & Adaptation | _(Phase 4)_ | ⬜ |
| G. Review & Notifications | _(Phase 5)_ | ⬜ |
| H. Records & Portfolio | _(Phase 6)_ | ⬜ |
| I. Billing & Subscription | _(Phase 7)_ | ⬜ |
| J. AI Policy Gateway & Metering | _(Phase 1)_ | ⬜ |

**Canonical contract:** async produces drafts, adults produce truth — a parent
gate always stands between an async AI result and student-visible or
record-of-truth state.
