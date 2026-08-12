# Phase 3 — Daily Work & Submission (module D)

The second half of the daily loop's student side: a Student works an assigned
item, the scaffolded tutor helps within bounds, Evidence is captured, and the
attempt is **Submitted** and handed off for assessment. Module D owns the
`Assigned → InProgress → Submitted` portion of the Submission→Assessment→Official
Grade machine and **stops at the assessment boundary** — module E (Phase 4) owns
everything downstream. Source of truth: [`mvp-specification.md`](mvp-specification.md)
§5, §8, §17.

Canonical contract held throughout: **async produces drafts, adults produce
truth**. A Submission never becomes a grade here; submitting only enqueues module
E's async assessment, and no AI result is ever the record of truth without a
parent approval (invariant 4).

## What this phase ships (`src/modules/daily-work/`)

- `types.ts` — SubmissionState, EvidenceKind + Evidence Policy, Evidence,
  Submission, Support Event, the tutor decision inputs (TutorConfig,
  DifficultySignal, EscalationPolicy), and the offline-queue model (QueuedOp,
  SubmissionSnapshot, ReconcileResult).
- `submission-state-machine.ts` — **pure, unit-tested** `Assigned → InProgress →
  Submitted`; `Submitted` is terminal for module D (the hand-off to E).
- `evidence-policy.ts` — **pure, unit-tested** `evidenceSatisfies` (accepted
  kinds, minimum items, adult-verification requirement; `none` is valid for
  observation-only work).
- `tutor-logic.ts` — **pure, unit-tested** scaffolded-tutor decisions:
  - `nextZpdStep` / `zpdStepFor` — ZPD progression (diagnose → hint →
    parallel_example → chunk → check).
  - `evaluateHardStops` — the **server-enforced hard-stops** (§8): never do the
    work; no graded-answer reveal unless a parent enabled it per
    Course/Assignment; nothing off-material. Fails closed and accumulates reasons.
  - `shouldEscalate` — escalate to a parent after repeated difficulty.
  - `contextHasAnswerKeyMaterial` — guard asserting answer-key/teacher-guide
    material never enters tutor context (invariant 2).
- `offline-queue.ts` — **pure, unit-tested** deterministic reconciliation:
  - `orderQueue` — total, stable ordering by `(clientTs, opId)`.
  - `reconcile` — replays queued ops on server authority with **last-write-wins**:
    append-only Evidence/Support Events always survive (idempotent dedup), while
    state transitions honor server authority and legality. The essential daily
    loop survives offline.
- `submission.ts` — operations (server-only, Admin SDK):
  - `assignWork` (parent+; creates a Submission in `Assigned`; supersession for
    resubmission).
  - `startWork` (Student own-scope; `Assigned → InProgress`).
  - `attachEvidence` (Student own-scope; **consent-gated**; upload kinds require a
    Storage path, `adult_verification` requires a verifying adult).
  - `submitWork` (Student own-scope; **consent-gated**; validates the Evidence
    Policy; `→ Submitted`; enqueues module E's async assessment — no grade built).
- `tutor.ts` — the scaffolded tutor (server-only, Admin SDK):
  - `requestTutorHelp` — authorize (fail-closed) → consent gate → hard-stop
    decision. A blocked request logs a `blocked` Support Event and **makes no AI
    call**. An allowed request builds an **answer-key-free** context, routes
    through **gateway J** (`purpose: 'tutoring'`, Essential), logs the ZPD Support
    Event, and escalates to a parent when difficulty crosses policy.

## Cross-cutting changes

- `identity/roles.ts` — added `submission`, `evidence`, `support_event` record
  types. A Student may **submit within own scope** (write) but has **no approve**
  on any — turning a Submission into an Official Grade is module E's parent gate.
- `firestore.rules` — added server-written, adult-read, deny-client-write
  `submissions`, `evidence`, and `supportEvents` collections under the household.
  Household isolation and answer-key isolation preserved; consent gating is
  enforced server-side before any write.
- `storage.rules` — added a narrow, household+auth-scoped Evidence upload allow at
  `households/{hid}/evidence/{studentId}/**`. It never matches the answer-keys
  prefix (OR-semantics-safe), and true consent enforcement remains server-side in
  `attachEvidence` (`assertCollectionAllowed`).

## Invariants enforced

- **Answer-key isolation (2):** tutor context is built without answer-key/teacher
  guide material and guarded (`contextHasAnswerKeyMaterial`); the tutor never
  reveals a graded answer unless a parent enabled it.
- **Fail-closed authz (3):** every operation authorizes before acting; the tutor
  and submission writes repeat authorization server-side.
- **No solely-automated consequential decision (4):** submitting enqueues async
  assessment; no grade is produced in module D.
- **Consent gating (6):** every child-data write (Evidence, submission, tutoring)
  calls `assertCollectionAllowed` first.
- **Essential learning never severed (7):** tutoring routes as Essential; the
  offline queue keeps the daily loop working through connectivity blips.
- **Bounded Student agency / parent authority intact:** Students submit own work
  and receive scaffolding, but never grade, approve, or reveal graded answers.

## Verify (no emulator / JDK needed)

```bash
npm run test:unit      # 51 tests total; 22 are Phase 3 (daily-work.test.ts)
```

`npx tsc --noEmit` is clean; `npx eslint src/modules/daily-work` is clean.

## Not verified here (JDK-gated)

- `npm run test:rules` requires the Firestore emulator (JDK 11+); this machine has
  JDK 1.8, so the new `submissions` / `evidence` / `supportEvents` rules and the
  `storage.rules` Evidence path are **not** proven in-emulator this phase.

## Deferred

- Age-adapted student UI (grades 1-3 / 4-8 / 9-12) and the offline PWA shell that
  drives the queue — issue #11.
- Real assessment hand-off: module E's idempotent assessment worker consumes the
  `Submitted` enqueue (Phase 4); here the boundary is recorded via audit +
  `assessmentEnqueuedAt`.
- Student-scoped Firestore reads (needs the student-uid ↔ Student-profile linkage,
  deferred with planning) and the household-membership custom claim the Storage
  Evidence rule scopes on.
- Real tutoring vendor behind the gateway (stubbed provider only).
