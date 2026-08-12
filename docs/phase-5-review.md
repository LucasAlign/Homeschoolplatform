# Phase 5 — Review & Notifications (module G)

Neutral, evidence-backed **Review Flags** and the notification cadences that route
them to adults. A Review Flag is a request for adult attention — it **never**
asserts misconduct on its own and **never** blocks essential learning. This phase
**consumes** the review signals other modules already produce (it does not
re-implement the producers): tutor escalation from module D, abnormal metadata-
only AI use from module J, and the allowed observation signals from the daily
loop. Source of truth: [`mvp-specification.md`](mvp-specification.md) §5 (Review
Flag state machine), §10 (Review Flags & notifications), §17 (invariants).

Canonical contract held throughout: **async produces drafts, adults produce
truth**. A flag surfaces a pattern; only an adult reviews and resolves it, and the
resolution outcome is the record.

## The non-surveillance posture (non-negotiable)

The complete set of allowed signals is fixed in `types.ts` (`REVIEW_SIGNAL_KINDS`):
implausibly fast work, rapid click-through, repeated low grades, sudden
performance change, excessive hints, missing evidence, submission mismatch, tutor
escalation, abnormal AI use. **No** webcams, keylogging, background recording,
screen recording, or covert tracking appear anywhere — they are listed only in
`FORBIDDEN_SIGNAL_SOURCES` so a test can assert none is ever an allowed kind. No
type, enum, field, or framing carries accusatory language.

## What this phase ships

### Module G — `src/modules/review/`

- `types.ts` — `ReviewFlagState` (`Raised → Notified → Reviewed → Resolved`), the
  neutral `ResolutionOutcome` set (`dismissed` / `acknowledged` / `action-taken`),
  the exhaustive `ReviewSignalKind` list (+ `FORBIDDEN_SIGNAL_SOURCES`), the
  immutable-evidence `ReviewFlag` (with `blocksLearning` pinned to the literal
  `false`), the `NotificationTier` / `NotificationKind` / `NotificationEvent` /
  `Notification` cadence types, and the `DigestBucket` rollup.
- `flag-state-machine.ts` — **pure, unit-tested** strict, forward-only
  `Raised → Notified → Reviewed → Resolved` (`Resolved` terminal), plus
  `isResolutionOutcome`.
- `signal-classification.ts` — **pure, unit-tested**:
  - `classifySignal` — a signal raises a flag ONLY when it is an allowed kind,
    is evidence-backed, and crosses its neutral threshold (per-kind direction via
    `crossesThreshold`); fails closed otherwise.
  - `isNeutralFraming` / `ACCUSATORY_TERMS` — the neutrality guarantee; every
    produced summary is a non-accusatory "worth an adult look".
  - `flagBlocksLearning` / `flagEffect` — the "never blocks essential learning"
    guarantee expressed as testable predicates (invariant 7).
- `notification-routing.ts` — **pure, unit-tested** `routeToTier`: `Immediate`
  (security / urgent parent-defined), `Weekly` (progress / trends), `Daily`
  (reviews, grades, questionable completion — the default).
- `aggregation.ts` — **pure, unit-tested** `aggregateForTier` /
  `buildDailyQueue` / `buildWeeklyDigest`: count-only rollups (by kind, by
  student, with source refs) that exclude already-delivered notifications.
- `review.ts` — operations (server-only, Admin SDK):
  - `raiseFlag` — system-invoked from a signal; classifies purely first (a
    below-threshold / evidence-less / unrecognized signal raises nothing and
    returns `null`), consent-gates, writes an immutable `Raised` flag, enqueues a
    routed notification, and advances the flag to `Notified`. Audited.
  - `enqueueNotification` — routes an event to a tier (`routeToTier`) and writes
    the queued record. Audited.
  - `resolveFlag` — **adult-only via `authorize`** (`review_flag` / `write`;
    Instructor Reviewer scope re-checked against the flag's Student). Walks the
    strict machine `Notified → Reviewed → Resolved` in one adult action and
    records the neutral outcome; evidence is never mutated. A Student can never
    reach here. Audited.
  - `summarizeQueue` — adult-read rollup of a tier's queued notifications (pure
    aggregation; no writes).

## Cross-cutting changes

- `identity/roles.ts` — added `review_flag` (adults `read` + `write`; a Student
  has **no** access — students do not resolve flags) and `notification` (adults
  `read` only; server-written). No role `approve`s either — resolution is a
  neutral `write`, not a record-of-truth approval.
- `firestore.rules` — added server-written, adult-read, deny-client-write
  `reviewFlags` and `notifications` under the household, both scoped by
  `reviewerCanSeeStudent`. Household isolation, answer-key isolation, and
  deny-by-default preserved; every write is a server operation.

## Invariants enforced

- **Household isolation (1):** flags/notifications live under `households/{hid}`;
  rules and `authorize` re-check membership.
- **Fail-closed authz (3):** `resolveFlag` and `summarizeQueue` authorize before
  acting; resolution is adult-only and a Student holds no `review_flag` capability.
- **No solely-automated consequential decision (4):** a flag is a neutral request
  only; an adult reviews and records the outcome.
- **Consent gating (6):** `raiseFlag` calls `assertCollectionAllowed` before
  writing student-scoped metadata.
- **Essential learning never severed (7):** `ReviewFlag.blocksLearning` is the
  literal `false`; `flagBlocksLearning` is a runtime guard. A flag routes a
  notification — it never gates work.
- **Immutable audit (9):** raise, enqueue, and resolve each write an audit event.

## Verify (no emulator / JDK needed)

```bash
npm run test:unit      # 102 tests total; 24 are Phase 5 (review.test.ts)
```

`npx tsc --noEmit` is clean; `npx eslint src/modules/review tests/unit/review.test.ts`
is clean.

## Not verified here (JDK-gated)

- `npm run test:rules` requires the Firestore emulator (JDK 11+); this machine has
  JDK 1.8, so the new `reviewFlags` / `notifications` client-facing rule matchers
  are **not** proven in-emulator this phase. Their server-side authorization and
  consent gates are exercised by the code path, but the rules remain unverified
  until the emulator can run.

## Deferred

- Real signal producers wiring into `raiseFlag` (module D tutor escalation and
  module J abnormal-use hand-offs emit signals; the dispatch that calls
  `raiseFlag` on them is deferred with those modules' Cloud Tasks wiring).
- The Immediate-tier delivery channel (Cloud Messaging / email) and the
  daily/weekly scheduled digest delivery jobs — `summarizeQueue` builds the
  rollup; the push/mark-delivered side is deferred with the notification transport.
- Parent-defined urgent-rule configuration surface (the `parentUrgent` input is
  honored by routing; the settings UI that sets it is deferred).
- Student-scoped grade/mastery reads and the flag-review UI (issue #10/#11).
- Firestore composite indexes for the `notifications` (tier) and `reviewFlags`
  queries — declared when the emulator/index config lands.
