# Phase 4 — Assessment & Grading (module E) + Mastery & Adaptation (module F)

The downstream half of the Submission→Assessment→Official Grade machine. Module
D (Phase 3) stopped at `Submitted` and enqueued an async assessment; Phase 4
**consumes** that hand-off. Module E produces an **advisory** AI Assessment and
gates the path to an immutable, parent-approved Official Grade; module F turns
accumulated signals into parent-confirmed Mastery and multi-signal-gated
adaptation drafts. Source of truth: [`mvp-specification.md`](mvp-specification.md)
§5 (state machine), §7, §8 (assessment authority), §9 (mastery), §17 (invariants).

Canonical contract held throughout: **async produces drafts, adults produce
truth**. The worker builds NO grade; no AI result becomes an Official Grade or a
canonical Mastery level without a recorded adult approval (invariant 4).

## What this phase ships

### Module E — `src/modules/assessment/`

- `types.ts` — AssessmentState, AssessabilityClass, the mandatory
  DisclosureEnvelope (suggested score, rationale, confidence, uncertainty/unread
  portions, assistance context, evidence examined), AIAssessment, OfficialGrade
  (immutable), and the parent-approval routing types.
- `assessment-state-machine.ts` — **pure, unit-tested** `AIAssessing →
  AssessmentReady → Superseded` (Superseded terminal; resubmission supersedes).
- `disclosure.ts` — **pure, unit-tested**:
  - `disclosureComplete` — the completeness gate (confidence + uncertainty +
    score must all be present to render a number).
  - `assessabilityFor` — derives the class; observation work and any incomplete
    envelope fall to `not-assessable-needs-adult` (no number) (§8).
  - `contextHasAnswerKeyMaterial` — the answer-key isolation guard for the
    assessment context (invariant 2), mirroring the module-D tutor guard.
- `grade-routing.ts` — **pure, unit-tested** `routeApproval`: `batch` only for
  high-confidence `objective-autoscorable`; `individual` for `subjective-rubric`;
  `manual` forced by transcription / a flag / low confidence / missing evidence /
  a large swing; `parent_only` for not-assessable (§8).
- `official-grade.ts` — **pure, unit-tested** supersession chaining
  (`nextGradeChain`), parent-override divergence (`computeDivergence`, retained),
  and `isLargeSwing` against the prior grade.
- `worker.ts` — the idempotent async assessment worker (Cloud Tasks → Cloud Run):
  consumes a `Submitted` submission, consent-gates, routes through **gateway J**
  (`purpose: 'assessment'`, Essential), summarizes Support-Event assistance,
  builds the disclosure envelope, classifies assessability, and publishes an
  advisory `AssessmentReady`. Builds no grade. Answer-key material never enters
  the context (guarded).
- `grading.ts` — the parent-approval gate (server-only, Admin SDK):
  - `approveAssessment` (Parent Admin+ `approve`; materializes one **immutable**
    Official Grade; supersession chain; parent override retained; `batch`
    requires batch-eligibility).
  - `batchApproveAssessments` — bulk-accept batch-eligible objective suggestions;
    rejects the whole call if any id is not batch-eligible.

### Module F — `src/modules/mastery/`

- `types.ts` — MasteryState, the canonical MasteryLevel scale, MasteryRecord
  (immutable via supersession), and the adaptation-gating + RemediationDraft
  types.
- `mastery-transitions.ts` — **pure, unit-tested** `Observed → Confirmed →
  Superseded`, plus `isCanonicalLevel` (rejects non-scale/free-text levels).
- `remediation-gating.ts` — **pure, unit-tested** `canDraftAdaptation`: needs
  multiple qualifying signals OR one strong parent-reviewed result meeting the
  configured confidence + recency thresholds; one low-confidence AI Assessment
  can never trigger adaptation (§9).
- `mastery.ts` — operations (server-only, Admin SDK):
  - `observeMastery` (parent+ write; advisory, consent-gated).
  - `confirmMastery` (**Parent Admin / Household Owner `approve` only**; new
    immutable Confirmed record superseding the prior; parent may confirm a level
    different from the observation).
  - `draftAdaptation` (multi-signal-gated; advisory; **not** inserted into a plan).
  - `approveAdaptationForPlanning` (parent gate toward module C; records the
    approval, never mutates a plan itself).

## Cross-cutting changes

- `identity/roles.ts` — added `ai_assessment`, `official_grade`, `mastery_record`,
  `remediation_draft`. Students **never** grade or approve: `official_grade` and
  `mastery_record` carry `approve` for parents only; a Student gets `read` on the
  Official Grade (suggested-vs-final, §8) and confirmed Mastery, nothing more.
- `firestore.rules` — added server-written, adult-read, deny-client-write
  `aiAssessments`, `officialGrades` (immutable — no client write ever),
  `masteryRecords`, and `remediationDrafts` under the household. Household
  isolation, answer-key isolation, and deny-by-default preserved; consent gating
  is enforced server-side before any write.

## Invariants enforced

- **Answer-key isolation (2):** the assessment context is built without answer
  keys and guarded (`contextHasAnswerKeyMaterial`); keys never enter the
  generative context (§8).
- **Fail-closed authz (3):** every operation authorizes before acting; approval
  is an `approve` action parents alone hold.
- **No solely-automated consequential decision (4):** the worker produces an
  advisory assessment only; an Official Grade and a canonical Mastery level each
  require a recorded adult approval; adaptation drafts never auto-enter a plan.
- **Immutability via supersession (5):** Official Grades and Mastery
  confirmations are append-only; resubmission/re-confirmation supersedes with a
  new record, never a mutation.
- **Consent gating (6):** assessment, observation, and adaptation drafting call
  `assertCollectionAllowed` first.
- **Essential learning never severed (7):** assessment routes as Essential;
  progression is never gated on grading.
- **Gateway J for AI (8):** the worker's only AI call routes through `invokeAI`
  with `purpose: 'assessment'`; vendor/model/feature/cost are logged.

## Verify (no emulator / JDK needed)

```bash
npm run test:unit      # 78 tests total; 27 are Phase 4 (assessment.test.ts + mastery.test.ts)
```

`npx tsc --noEmit` is clean; `npx eslint src/modules/assessment src/modules/mastery` is clean.

## Not verified here (JDK-gated)

- `npm run test:rules` requires the Firestore emulator (JDK 11+); this machine has
  JDK 1.8, so the new `aiAssessments` / `officialGrades` / `masteryRecords` /
  `remediationDrafts` rules are **not** proven in-emulator this phase. Their
  server-side authorization and consent gates are exercised by the code path, but
  the client-facing rule matchers remain unverified until the emulator can run.

## Deferred

- Real assessment vendor behind the gateway (stub provider only); `worker.ts`
  builds a placeholder envelope, as `ingestion/worker.ts` does for extraction.
- Student-scoped grade/mastery reads (needs the student-uid ↔ Student-profile
  linkage, deferred with planning and daily work); rules keep these adult-read
  for now.
- Firestore composite indexes for the `officialGrades` (assignment+student+
  version) and `masteryRecords` (student+skill+state) queries — declared when the
  emulator/index config lands.
- The Cloud Tasks dispatch that invokes `assessSubmission` on the module-D
  enqueue, and the parent-facing approval-queue / grade-review UI (issue #10/#11).
- Wiring approved remediation drafts into module C plans (the Planning operation
  that adopts a parent-approved draft).
