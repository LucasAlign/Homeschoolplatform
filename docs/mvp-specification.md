# Lucas Align Homeschool — Consolidated MVP Specification

**Status:** Implementation-ready. Synthesizes the 17 approved wayfinder decisions (GitHub issues #2–#18) resolved under map [#1](https://github.com/LucasAlign/Homeschoolplatform/issues/1). Source brief: `library/handoff.md`; canonical language: `CONTEXT.md`.

> **Roadmap alignment.** [`ROADMAP.md`](../ROADMAP.md) has been reconciled to this direction (Firebase, AI-first ingestion/tutor/assessment, COPPA-grade privacy, **no accredited transcripts**) and is the phase-level view of this spec. The repository's original Prisma + SQLite scaffold predates the approved direction and is superseded — replaced by Firebase in Phase 0. Where any older artifact disagrees, this document is authoritative.

---

## 1. Product

Lucas Align is a Firebase-hosted homeschool **coordination** platform for US households with 1–10 active students in grades 1–12. It is a homeschool aid — **not** an online school, publisher, accredited institution, or guaranteed state-compliance service. It coordinates physical books, worksheets, PDFs, websites, third-party apps, and hybrid curricula.

The non-negotiable MVP loop:

> **Import → AI extraction → parent approval → student checklist → evidence submission → parent review**

Reliable ingestion and a trustworthy daily workflow take priority over advanced AI.

### Positioning and business
- Annual school-year billing near **$10/month per active Student**; sibling discounts; free adult accounts.
- Included AI allowance with a **protected educational reserve**; disclosed, parent-capped charges for extraordinary AI use.

## 2. People and roles (`CONTEXT.md`, issue #12)

- **Household** — the family-level org owning students, memberships, subscriptions, curriculum records, and school years. The top-level aggregate root.
- **Household Owner** — final authority over household data, billing, permissions, consent, and School-Year completion.
- **Parent Admin** — plans, approves, assesses, and reviews work; full academic authority, no billing/consent/role/lifecycle authority.
- **Instructor Reviewer** — scoped to assigned Students/subjects; advisory-only unless explicitly, auditable-elevated.
- **Student** — a child whose work is coordinated; own-scope actions only.
- **Consented technician** — Lucas Align staff, metadata-only by default (see §16).

## 3. Canonical domain glossary

Use `CONTEXT.md` as the ubiquitous language (Curriculum Source, Course, Lesson, Assignment, Requirement, Proposed Schedule, Approved Plan, Plan Revision, Evidence Policy, Evidence, Submission, Support Event, AI Assessment, Official Grade, Mastery Record, Review Flag, School Year, Portfolio Snapshot). This spec uses those terms exactly.

---

## 4. Architecture — bounded modules (issue #14)

Nine domain modules + three cross-cutting platform modules.

**Domain:** A. Identity & Access · B. Curriculum Ingestion · C. Planning & Scheduling · D. Daily Work & Submission · E. Assessment & Grading · F. Mastery & Adaptation · G. Review & Notifications · H. Records & Portfolio · I. Billing & Subscription.

**Cross-cutting platform:** J. AI Policy Gateway & Metering · K. Consent, Retention & Deletion · L. Audit & Access Log.

### Entity ownership & identity
- Every canonical entity has exactly **one owning module (single writer)**; other modules hold read models / reference by opaque ID.
- **Household** is the aggregate root; **Student** a child aggregate; every record hard-scoped under a Household.
- **Immutable-via-supersession** entities (append-only, never mutated): Plan Revision, Official Grade, Portfolio Snapshot, consent receipt, audit event, Mastery confirmation.
- Answer Keys / Teacher Guides live in a **separate storage boundary** with their own access path.
- Identifiers are opaque and **pseudonymous in all logs/metrics**.

### Asynchronous boundary & idempotency
- **Sync path:** authenticated command → server-side validate + authorize (fail-closed) → write canonical state (Firestore) → enqueue side-effect work.
- **Async path:** Cloud Tasks → **idempotent Cloud Run workers** (OCR, extraction, AI assessment, portfolio PDF) keyed by idempotency IDs, at-least-once with page-window retries, writing back **advisory drafts/projections that never auto-publish**.
- **All AI calls route through module J.** Offline client queue reconciles against server authority (last-write-wins).
- **Canonical contract: _async produces drafts, adults produce truth._** A parent gate always stands between an async AI result and student-visible or record-of-truth state.

---

## 5. Canonical state machines (issue #14)

**Import (B):** `Uploading → Uploaded` (hashed, private, role-tagged `student`/`answer_key`/`teacher_guide`/`mixed`, rights attested) `→ Preflight → Queued → Processing` (page-chunked OCR/layout → multimodal structuring on a versioned schema via J) `→ ExtractedDraft` (confidence, provenance, quality flags) `→` **parent review** `→ Approved` (adopts a Course in C) | `NeedsCorrection` (recapture/crop/transcribe, loops) | `Failed`/`Rejected` (visible, recoverable, originals preserved). Answer-key/teacher-guide isolated at `Uploaded`; batch-approve only high-confidence, internally-consistent drafts; no silent repair.

**Planning (C):** adopted Course + Calendar + constraints `→ ProposedSchedule` (advisory; full or change-set) `→` parent review `→` approve whole/selected `→` one immutable `PlanRevision` `→` current `ApprovedPlan`. Optimistic concurrency on approval. Student reorder-same-day / defer-within-policy never mutate the Approved Plan; missed/deferred work → new Proposed Schedule. Bounded pre-authorized auto-reflow preserves fixed dates, sequence, workload caps.

**Submission → Assessment → Official Grade (D→E):** `Assigned` → student works (tutor emits Support Events) `→ Submitted` `→` async `AIAssessing` (via J) `→ AssessmentReady` (assessability class + disclosure envelope) `→` parent approval queue `→` immutable `OfficialGrade`. Resubmission → new Submission → new Assessment → new **superseding** Official Grade. Progression to the next step is **not** gated on grading.

**Review Flag (G):** `Raised` (evidence + signal + neutral framing) `→ Notified` (by tier) `→ Reviewed` `→ Resolved` (dismissed/acknowledged/action-taken). Never asserts misconduct alone; never blocks essential learning.

**Mastery (F):** `Observed` (advisory, evidence-backed, confidence) `→ Confirmed` (Parent Admin only) `→ Superseded`. Scale: NotYetAssessed, Emerging, Developing, Proficient, Advanced.

**School Year + Portfolio Snapshot (H):** `Active` `→` (Household-Owner completion, gated) `→` draft Snapshot `→` Owner review/approve `→` `Completed`/`Partial`/`Withdrawn`. Snapshot `Draft → Approved` (immutable, self-contained) `→ Superseded` (logged reopen) and **wholly deletable** on an authorized export-first request.

**Consent (K):** per-Student/per-purpose `NotRequested → Requested → Active → Revoked`, plus `ReConsentRequired` and `Abandoned`. Collection gated on `Active`; revocation immediate and forward-only.

---

## 6. Curriculum ingestion (issues #2, #17)

- **Inputs:** phone photos/screenshots (JPEG/PNG/WebP/HEIC, ≤20 MB / 40 MP / one logical page), PDFs (≤50 MB / 500 pages; split larger), links stored as **bookmarks only** (no crawling).
- **Pattern:** resumable private upload → hash + isolate adult material → idempotent page-chunked OCR/layout → send only needed page windows to a multimodal model on a versioned schema → validate values/references → present sequence, workload, tests, flags, confidence, provenance for approval → delete transient derivatives on schedule.
- **Promise:** "We create an editable draft from material your household is authorized to use." No promise of perfect OCR/handwriting.
- **Never** silently repair handwriting, math notation, answer keys, dates, or lesson numbering. Student transcriptions are labeled and flagged.
- **Benchmark gates (#17):** rights-cleared eval corpus; metrics = print vs handwriting error (separate), lesson/field precision-recall, confidence calibration, **zero answer-key leakage**, consequential-error escape rate, latency/retry, per-100-page & per-course cost, parent correction time. Exact thresholds set by a **pre-pilot empirical-validation run** (deferred; needs corpus + Vertex access).

## 7. Planning & scheduling (issue #6)

Version every adult approval into immutable effective-dated Plan Revisions; bound Student reordering/deferral with visible consequences; only adults remove Requirements, grant exemptions, or change grade weighting; remediation/enrichment enters the plan only via parent-approved drafts.

## 8. Assessment, grading & scaffolded tutor (issue #7)

- **AI Assessment is strictly advisory** for every submission type, tagged with an assessability class, carrying a mandatory **disclosure envelope** (score, rationale, confidence, uncertainty/unread portions, assistance context, evidence). `not-assessable-needs-adult` routes to the parent with no number.
- **Path to Official Grade:** high-confidence objective → batch-approvable; subjective → individual; always-manual for transcribed/flagged/low-confidence/missing-evidence/large-swing. No AI result becomes an Official Grade without a recorded adult approval.
- **Tutor (ZPD / `/teach`):** diagnose → small hint → parallel example (not the answer) → chunk → check. Answer-revelation on graded work **off by default**, per-Course/Assignment parent toggle only. Every intervention logged as a Support Event. Escalation after repeated difficulty; **server-enforced hard-stops** (no graded-answer reveal, no doing the work, nothing off-material).
- **Answer-key isolation:** keys never in tutor or assessment generative context; a parent-enabled reveal is a separate audited retrieval.
- **Assistance** is disclosed and folded into uncertainty; AI never auto-penalizes — the parent decides.
- **Official Grades** are immutable; resubmission supersedes; parent override retained; students always see **suggested-vs-final**.

## 9. Mastery & adaptation (issue #6)

Advisory observations; parent-confirmed canonical levels; immutable history; multi-signal-gated remediation/enrichment drafts requiring parent approval before entering a plan or student view.

## 10. Review flags & notifications (handoff, #7, #13)

Neutral, evidence-backed Review Flags — never accusations. Signals: implausibly fast work, rapid click-through, repeated low grades, sudden performance change, excessive hints, missing evidence, submission mismatch, abnormal AI use. **No** webcams, keylogging, background recording, or covert tracking. Cadence: **Immediate** (security/urgent), **Daily queue** (reviews, grades, questionable completion), **Weekly digest** (trends).

## 11. Records & portfolio (issue #8)

School-Year completion is a **Household Owner** act gated on terminal-state Assignments with no pending assessments/unresolved flags (or explicit acknowledged-incomplete). It freezes an immutable, parent-approved, self-contained Portfolio Snapshot (answer-key-free; advisory-vs-official preserved). Corrections supersede rather than mutate; statuses Completed/Partial/Withdrawn; each snapshot bound to one Student+year. **Not** an accredited transcript.

## 12. AI allowance, reserve, billing & abuse (issue #13)

Meter every gateway AI call in normalized **per-Student cost-units**, classified **Essential** vs **Discretionary**. A bounded **protected reserve** keeps essential learning running even at an exhausted allowance and **$0 overage**. Allowance pooled at the Household, per-Student metered. Degrade Discretionary-first up a parent-visible enforcement ladder. **Default overage $0** fail-closed hard cap, liftable only by explicit, capped, revocable Household-Owner consent. Rate limits + neutral metadata-only technician flags bound runaway/abusive use; essential learning is never severed.

## 13. Authorization, roles & staff access (issue #12)

Server-side, fail-closed `(role × record × action)` model, household-scoped with reviewer sub-scopes. **Four non-waivable invariants:** household isolation; answer-key isolation; staff default-deny to student content; no solely-automated consequential decisions. Household-Owner-only: billing, consent, adult roles, lifecycle, year-completion. Consented-technician access is tiered (metadata-only → time-boxed authorized case → narrow emergency) with **immutable, household-visible audit**. Revocation is immediate and **forward-only**.

## 14. Consent, retention, deletion & export (issues #15, #3)

Consent state machine gates collection (§5). Every data class bound to a **purpose-limited retention tier** (Tier 0 transient / Tier 1 operational / Tier 2 active-academic / Tier 3 durable — only parent-approved snapshots + content-free compliance records persist long-term). Deletion: reversible grace → **cascading hard delete** across DB/storage/indexes/embeddings/caches/logs/queues/exports/**backups/subprocessors** → content-free ledger → honest **~180-day backup ceiling**. Portable, household-scoped export (JSON/CSV + portfolio PDF) with notify→export→delete on inactivity. Snapshot is **un-editable but wholly deletable** on an authorized, export-first request. Exact day-counts fixed under counsel review.

## 15. Child-privacy & vendor constraints (issue #3)

Treat as **child-directed under COPPA**: verified parental consent before collection; purpose-specific retention; no shared-model training on student work; encryption; audited staff access; metadata-only technician alerts. Every AI/infra vendor under an executed DPA with no-training, retention, deletion, security, and subprocessor terms; identifiable child content only on approved US endpoints. **Not FERPA-positioned.** Launch blocked on counsel review of COPPA + applicable state law.

## 16. Infrastructure & region (issues #16, #4)

- **Firebase**, App Hosting + Auth + App Check + Firestore Standard + Cloud Storage + 2nd-gen Functions + Cloud Tasks → **Cloud Run** for idempotent OCR/extraction/assessment/PDF jobs. Blaze mandatory.
- **Immutable regional Firestore in `us-east4`** (knowingly chosen over multi-region `nam7`: East-Coast latency + pilot cost, accepting 99.99% and no auto-failover). Co-locate Storage/Functions/Tasks/Run; **all child data pinned US-only** end-to-end.
- **DR:** daily managed backups + 7-day PITR + a region-independent US-multiregion export; RPO ~minutes/≤24h; **pre-pilot restore drill**. Offline PWA carries the daily loop through blips; AI/imports fail visibly and recoverably.

---

## 17. Cross-module invariants (non-waivable, issue #14)

1. Household isolation — no cross-household read/write, ever.
2. Answer-key/teacher-guide isolation from students, default-reviewers, tutor, and AI-assessment context.
3. Server-side, fail-closed authorization repeated at every sensitive access.
4. No solely-automated consequential decision — async produces drafts, adults produce truth.
5. Immutability via supersession for revisions, grades, snapshots, receipts, audit events.
6. Collection gated on `Active` consent; revocation immediate and forward-only.
7. Essential learning never severed by budget, a flag, or an abuse throttle.
8. Every privileged AI call through gateway J, context-minimized, US endpoints, vendor/model/feature/cost logged.
9. Every sensitive access writes an immutable audit event; staff content access is household-visible.
10. US-only residency end-to-end on immutable regional `us-east4` with the defined DR posture.

## 18. Pilot instrumentation & acceptance scorecard (issues #18, #5)

Measure the four-week pilot **only from metadata and adult-reported signals at the #14 approval seams** — no Student content/PII in telemetry; consented, retention-limited, aggregated. Metric families map to the #5 gates (efficiency, ingestion reliability, AI acceptance, independence, cost, safety, portfolio usefulness).

**Go/no-go — hard gates (non-waivable):** ≥10 households × 4 active weeks on mixed curricula through the full loop; zero unresolved sev-1 privacy/authorization/answer-key/data-loss/billing/child-safety defect; verified isolation/consent/answer-key/deletion-export; per-Student cost within the model with working caps. **Target metrics** (efficiency, AI-acceptance, independence, portfolio) may miss only via a documented, evidence-backed exception with a corrective plan. The founder Household Owner is the launch decision-maker; safety/privacy/authorization/integrity/answer-key/parental-authority gates cannot be waived.

### Efficiency targets (#5)
Household + first Student < 5 active min · Course approval < 10 active min (excl. processing) · Normal daily review < 5 active min · routine approvals batchable · Review Flags within two interactions.

## 19. Launch exclusions (out of scope for MVP)

Accreditation / operating as a school; guaranteed state compliance; official transcripts, graduation, HS-credit certification; native mobile apps; broad publisher integrations / authenticated crawling / curriculum reproduction; invasive monitoring, advertising, public leaderboards, sibling comparisons; any automation that weakens parent authority.

---

## 20. Phased roadmap (Firebase/AI direction)

| Phase | Ships | Key modules | Exit gate |
|-------|-------|-------------|-----------|
| **0. Foundation** | Firebase project in `us-east4`, Auth, App Check, Firestore, Storage, IAM skeleton, Household/roles, consent gate, audit log | A, K(min), L | Household isolation + fail-closed authz + consent gating pass in emulator |
| **1. Ingestion MVP** | Import→OCR→extract→draft→parent-approve; answer-key isolation; AI gateway + metering + cost caps | B, J | Trustworthy draft approvable < 10 min; zero answer-key leakage; caps enforced |
| **2. Planning** | Proposed Schedule → Plan Revision → Approved Plan; School Calendar; deferral/reflow | C | Immutable revisions; bounded student agency; optimistic-concurrency approval |
| **3. Daily work & submission** | Age-adapted student experience (1-3/4-8/9-12), evidence capture, offline queue, tutor + Support Events | D | Daily loop offline-capable; suggested-vs-final; tutor hard-stops enforced |
| **4. Assessment & grading** | Advisory AI Assessment, approval queue, immutable Official Grade, Mastery | E, F | No grade without adult approval; supersession + override retained |
| **5. Review & notifications** | Review Flags, immediate/daily/weekly cadences | G | Neutral flags; flags within two interactions; no surveillance |
| **6. Records & portfolio** | School-Year completion, Portfolio Snapshot, export/deletion lifecycle | H, K(full) | Immutable snapshot; cascading deletion + ledger; portable export |
| **7. Billing** | Subscription, allowance funding, overage consent/ceilings | I | $0-overage default; reserve protects essential learning |
| **8. Pilot readiness** | #18 instrumentation, DR restore drill, ingestion benchmark empirical run, accessibility conformance, security/legal launch gates | all | All non-waivable gates green → founder household → 10–20 family pilot |

## 21. Deferred / open items

- **Empirical ingestion benchmark run** (#17) — needs rights-cleared corpus + Vertex/Document AI/Vision access; sets exact accuracy/latency/cost thresholds. Pre-pilot blocking.
- **UI prototype builds** (#9, #10, #11) — throwaway variations to build during implementation; decisions and acceptance criteria fixed.
- **Exact numeric thresholds** — pilot acceptance percentages (#5/#18), retention day-counts (#15), ingestion gates (#17) — fixed under counsel/empirical validation.
- **Accessibility conformance standard + test plan** — accessibility is fixed as MVP scope; the specific standard remains to be set.
- **Incident-response runbook + technician tooling** — controls fixed (#12/#18); concrete runbook remains.
- ~~Retire the legacy Prisma/SQLite scaffold~~ — **done**: `prisma/`, `db:*` scripts, Prisma deps, the Prisma-backed pages, and Vercel/starter `public/` assets are removed; a minimal placeholder landing page remains.

## 22. Decision provenance

| Area | Issue |
|------|-------|
| Curriculum-ingestion envelope | [#2](https://github.com/LucasAlign/Homeschoolplatform/issues/2) |
| Child-privacy & AI-vendor constraints | [#3](https://github.com/LucasAlign/Homeschoolplatform/issues/3) |
| Firebase capability & cost | [#4](https://github.com/LucasAlign/Homeschoolplatform/issues/4) |
| MVP contract & pilot boundary | [#5](https://github.com/LucasAlign/Homeschoolplatform/issues/5) |
| Scheduling, mastery, adaptation authority | [#6](https://github.com/LucasAlign/Homeschoolplatform/issues/6) |
| Assessment & scaffolded-tutor authority | [#7](https://github.com/LucasAlign/Homeschoolplatform/issues/7) |
| School-Year completion & Portfolio Snapshot | [#8](https://github.com/LucasAlign/Homeschoolplatform/issues/8) |
| Household authorization & staff access | [#12](https://github.com/LucasAlign/Homeschoolplatform/issues/12) |
| AI allowance, reserve, billing & abuse | [#13](https://github.com/LucasAlign/Homeschoolplatform/issues/13) |
| Canonical boundaries & state machines | [#14](https://github.com/LucasAlign/Homeschoolplatform/issues/14) |
| Consent, retention, deletion & export | [#15](https://github.com/LucasAlign/Homeschoolplatform/issues/15) |
| Firebase region & availability | [#16](https://github.com/LucasAlign/Homeschoolplatform/issues/16) |
| Ingestion quality & cost benchmark | [#17](https://github.com/LucasAlign/Homeschoolplatform/issues/17) |
| Pilot instrumentation & scorecard | [#18](https://github.com/LucasAlign/Homeschoolplatform/issues/18) |
| Prototypes (import / student / evidence) | [#9](https://github.com/LucasAlign/Homeschoolplatform/issues/9) · [#10](https://github.com/LucasAlign/Homeschoolplatform/issues/10) · [#11](https://github.com/LucasAlign/Homeschoolplatform/issues/11) |
