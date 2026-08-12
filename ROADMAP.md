# Lucas Align Homeschool — Build Roadmap

A curriculum-first homeschool **coordination** platform for US households (1–10 students, grades 1–12).
A homeschool **aid** — not an online school, publisher, accredited institution, or state-compliance guarantee.

**Stack:** Next.js (App Router) PWA + TypeScript on **Firebase** (App Hosting, Auth, App Check,
Firestore, Cloud Storage, Cloud Functions, **Cloud Run** for long OCR/AI/PDF jobs, Cloud Tasks,
Secret Manager, Cloud Messaging). Region: **`us-east4`** (immutable, US-only child-data residency).

> **Source of truth:** [`docs/mvp-specification.md`](docs/mvp-specification.md) — the consolidated MVP
> specification synthesizing the 17 approved wayfinder decisions (GitHub issues #2–#18 under map #1).
> This roadmap is the phase-level view of that spec.

> **⚠️ Legacy scaffold note.** The repository currently contains a pre-wayfinder scaffold on
> **Prisma + SQLite** (see `prisma/`, the `db:*` npm scripts, and Vercel assets in `public/`). That
> stack predates the approved direction and is **superseded** by this roadmap: Firebase replaces
> Prisma/SQLite, and there are **no accredited transcripts** in scope. The Next.js app shell is
> reusable; the data layer is replaced in Phase 0.

The non-negotiable MVP loop:

> **Import → AI extraction → parent approval → student checklist → evidence submission → parent review**

## Phases

| Phase | Name | Ships | Modules | Status |
|-------|------|-------|---------|--------|
| **0** | Foundation | Firebase project in `us-east4`; Auth, App Check, Firestore, Storage; IAM + server-side fail-closed authorization; Household + roles; consent gate; audit log. Replaces the legacy Prisma/SQLite scaffold. | A, K(min), L | 🚧 Scaffolded — exit-gate rules tests need JDK 11+ to run |
| **1** | Curriculum Ingestion *(MVP core)* | Import → page-chunked OCR → multimodal extraction → parent-approved Course draft; answer-key isolation; AI policy gateway + per-Student metering + cost caps | B, J | 🚧 In progress — state machine, gateway & metering built + unit-tested; real OCR/vendor + UI pending |
| **2** | Planning & Scheduling | Proposed Schedule → immutable Plan Revision → Approved Plan; School Calendar; bounded deferral/reflow | C | 🚧 In progress — planning logic, immutable revisions & optimistic-concurrency approval built + unit-tested; calendar UI pending |
| **3** | Daily Work & Submission | Age-adapted student experience (1-3 / 4-8 / 9-12); Evidence capture; offline PWA queue; scaffolded tutor + Support Events | D | 🚧 In progress — Submission state machine (Assigned→Submitted), Evidence Policy, offline-queue reconciliation, and scaffolded-tutor hard-stops/escalation built + unit-tested; age-adapted student UI + real assessment hand-off (module E) pending |
| **4** | Assessment & Grading | Advisory AI Assessment + disclosure envelope; parent approval queue; immutable Official Grade; Mastery Records | E, F | ⬜ Planned |
| **5** | Review & Notifications | Neutral evidence-backed Review Flags; immediate / daily / weekly cadences | G | ⬜ Planned |
| **6** | Records & Portfolio | School-Year completion; immutable Portfolio Snapshot; consent/retention/deletion/export lifecycle | H, K(full) | ⬜ Planned |
| **7** | Billing & Subscription | ~$10/mo per active Student; included allowance + protected reserve; $0-default parent-capped overage | I | ⬜ Planned |
| **8** | Pilot Readiness & Launch | Privacy-preserving instrumentation; DR restore drill; ingestion benchmark run; accessibility conformance; security/legal launch gates → founder household → 10–20 family pilot | all | ⬜ Planned |

Exit gates for each phase are defined in [`docs/mvp-specification.md` §20](docs/mvp-specification.md).

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

**Current (legacy scaffold, being replaced in Phase 0):** the app runs on Next.js with a Prisma +
SQLite dev database.

```bash
npm run dev          # start the app on http://localhost:3000
npm run db:push      # (legacy) sync Prisma schema to the SQLite dev DB
npm run db:seed      # (legacy) load sample curriculum
```

**Target (from Phase 0):** Next.js PWA against the **Firebase Emulator Suite** (Auth, Firestore,
Storage, Functions), with Cloud Run workers for OCR/AI/PDF jobs. Emulator scripts and configuration
are established in Phase 0; the legacy `db:*` scripts are removed once the Firestore data layer lands.

## Non-negotiables

Verified parental consent (COPPA); no shared-model training on student work; answer-key isolation;
parent authority over requirements and Official Grades; household isolation; data export/deletion;
protected educational reserve so essential learning never stops; no surveillance (no webcams,
keylogging, background recording, covert tracking); no public leaderboards or sibling comparisons.
