# Phase 6 — Records & Portfolio (module H) + full Consent/Retention/Deletion/Export (module K)

School-Year completion, the immutable **Portfolio Snapshot**, and the full
consent-lifecycle back half — **retention tiers, cascading deletion, and portable
export**. School-Year completion is a **Household-Owner** act that freezes an
immutable, parent-approved, self-contained snapshot; a snapshot is un-editable but
**wholly deletable** on an authorized, export-first request. Source of truth:
[`mvp-specification.md`](mvp-specification.md) §5 (School Year + Snapshot state
machine, Consent machine), §11 (Records & portfolio), §14 (Consent, Retention,
Deletion & Export), §17 (invariants).

Canonical contract held throughout: **async produces drafts, adults produce
truth**. Completion, snapshot approval, snapshot reopen, deletion, and export are
all **Household-Owner-only** lifecycle acts (§13) — never solely automated.

## What this phase ships

### Module H — `src/modules/records/`

- `types.ts` — `SchoolYearState` (`Active → Completed | Partial | Withdrawn`),
  `SnapshotState` (`Draft → Approved → Superseded`), the completion-input /
  evaluation shapes, the snapshot content classes (`SNAPSHOT_INCLUDED_CLASSES` /
  `SNAPSHOT_EXCLUDED_CLASSES`), the self-contained `PortfolioSnapshot`, and the
  supersession-chain types.
- `school-year-state-machine.ts` — **pure, unit-tested** two strict, forward-only
  machines: the School Year (three terminal outcomes) and the Snapshot
  (`Superseded` terminal), plus assert/terminal helpers.
- `completion.ts` — **pure, unit-tested** `evaluateCompletionPreconditions`: every
  in-scope Assignment terminal (graded / exempted / acknowledged-incomplete), no
  pending AI Assessment, no unresolved Review Flag — else **blocked** unless the
  Owner explicitly acknowledges + records the incompletes (→ a recorded
  `Partial`). Withdrawal is always available and records outstanding items.
- `snapshot.ts` — **pure, unit-tested** `assembleSnapshotContent` + the
  **answer-key / adult-content exclusion filter**: answer keys / teacher guides
  are excluded by rule (invariant 2, never overridable), verbatim tutor
  transcripts are summarized only, an AI Assessment enters only as
  advisory-labeled context (never a standalone grade), Evidence/photos enter only
  when parent-selected and Official Grades only when parent-approved, cross-student
  items are rejected (bound to one Student). `assertNoAnswerKeyLeakage` is a
  defence-in-depth guard, and `nextSnapshotChain` mirrors Official Grade
  supersession for reopens (invariant 5).
- `records.ts` — operations (server-only, Admin SDK):
  - `completeSchoolYear` — **Household-Owner-only** via `authorize`. Evaluates the
    preconditions purely (throws if blocked without acknowledgement), advances the
    year to its terminal outcome, freezes the final Plan Revision, and writes a
    **Draft** snapshot assembled through the exclusion filter. Audited.
  - `approveSnapshot` — **Owner-only**. `Draft → Approved` (immutable copy);
    re-asserts no answer-key leakage before freezing. Audited.
  - `reopenSnapshot` — **Owner-only, always logged**. `Approved → Superseded`
    **without mutating** the copy, and materializes a new **Draft** that supersedes
    it (invariant 5). Audited with the reopen reason.

### Module K (full) — `src/modules/consent/`

- `types.ts` (extended) — retention tiers + `DataClass`, the deletion surfaces /
  plan / **content-free ledger** types, and the export bundle / scope / inactivity
  types.
- `retention.ts` — **pure, unit-tested** `classifyRetention`: a **total**
  `RETENTION_MAP` binding every data class to a purpose-limited tier (Tier 0
  transient / 1 operational / 2 active-academic / 3 durable). `persistsLongTerm`
  is true for **Tier 3 only** — parent-approved snapshots + content-free compliance
  records (§14).
- `deletion.ts` — **pure, unit-tested** `generateDeletionPlan`: a **cascading**
  plan across all ten surfaces (DB / storage / indexes / embeddings / caches /
  logs / queues / exports / **backups / subprocessors**), a reversible grace
  window, an **honest ~180-day backup ceiling** (`purge_on_rotation`),
  subprocessor propagation, and content-free log retention. A **legal hold**
  overrides and blocks the cascade; deletion is **export-first** (blocked without a
  completed export). Also `resolveImmutableRecordMutation` — the
  **immutability-vs-deletion rule**: reject every edit, permit a whole-delete only
  when authorized AND export-first (mutation ≠ existence).
- `export.ts` — **pure, unit-tested** `buildExportScope`: household-scoped
  (cross-household items excluded, invariant 1), **adult content separated** from
  child academic content into two bundles, transient derivatives never exported.
  `resolveInactivityPhase` drives the notify → export → delete flow.
- `data-lifecycle.ts` — operations (server-only, Admin SDK):
  - `requestDeletion` — **Owner-only**. Generates the plan; a blocked plan (legal
    hold / missing export) throws. Writes the **content-free deletion ledger**
    entry (durable, owner-read) and audits. The cross-surface cascade execution is
    a deferred idempotent worker.
  - `requestExport` — **Owner-only**. Builds the separated export scope and audits;
    JSON/CSV serialization + the portfolio-PDF render are a deferred worker.

## Cross-cutting changes

- `identity/roles.ts` — added `school_year`, `portfolio_snapshot`, `deletion`,
  `export`. Completion / snapshot approval / reopen / deletion / export are
  **Household-Owner-only** (`approve`); a Parent Admin has academic authority but
  **not** lifecycle authority, so it reads but never writes/approves these. A
  Student reads their **own** portfolio.
- `firestore.rules` — added server-written, deny-client-write `schoolYears` and
  `portfolioSnapshots` (adult-read, reviewer-scoped; `portfolioSnapshots`
  immutable) and the content-free, **owner-read** `deletionLedger`. Household
  isolation, answer-key isolation, and deny-by-default preserved; every write is a
  server operation.

## Invariants enforced

- **Household isolation (1):** records live under `households/{hid}`; assembly and
  export reject cross-student / cross-household items; rules re-check membership.
- **Answer-key isolation (2):** the snapshot exclusion filter drops answer keys /
  teacher guides unconditionally, and `assertNoAnswerKeyLeakage` guards the freeze.
- **Fail-closed authz (3):** every records/lifecycle operation authorizes first;
  completion / approval / reopen / deletion / export are Owner-only.
- **No solely-automated consequential decision (4):** completion, snapshot
  approval, deletion, and export are adult acts; the snapshot content gates on
  parent selection/approval.
- **Immutability via supersession (5):** an Approved snapshot is never mutated — a
  logged reopen supersedes it; `resolveImmutableRecordMutation` rejects edits.
- **Retention purpose-limitation (§14):** only Tier 3 (approved snapshots +
  content-free compliance records) persists long-term.
- **Immutable audit (9):** completion, approval, reopen, deletion, and export each
  write an audit event.

## Verify (no emulator / JDK needed)

```bash
npm run test:unit      # 133 tests total; 31 are Phase 6
                       #   records.test.ts        (18) — module H
                       #   consent-lifecycle.test.ts (13) — module K full
```

`npx tsc --noEmit` is clean; `npx eslint src/modules/records src/modules/consent
src/modules/identity tests/unit/records.test.ts tests/unit/consent-lifecycle.test.ts`
is clean.

## Not verified here (JDK-gated)

- `npm run test:rules` requires the Firestore emulator (JDK 11+); this machine has
  **JDK 1.8**, so the new `schoolYears` / `portfolioSnapshots` / `deletionLedger`
  client-facing rule matchers are **not** proven in-emulator this phase. Their
  server-side authorization and the deny-client-write posture are exercised by the
  code path, but the rules remain unverified until the emulator can run.

## Deferred

- The **cascading deletion executor** — the idempotent Cloud Run worker that
  actually clears storage / indexes / embeddings / caches / logs / queues /
  exports / backups and propagates subprocessor deletion. `generateDeletionPlan`
  produces the plan and `requestDeletion` writes the content-free ledger; the
  cross-surface execution is deferred with the worker infrastructure.
- The **portfolio-PDF render** — a deferred worker that renders the **approved**
  snapshot to PDF (not a Next route). `buildExportScope` decides scope; the
  serialization (JSON/CSV) and PDF generation are deferred.
- The **notify → export → delete inactivity job** — `resolveInactivityPhase` is
  the pure phase resolver; the scheduled sweep that acts on it is deferred.
- Exact **retention day-counts** and grace/inactivity thresholds — fixed under
  counsel review (§21); the tier classification is the durable part this phase owns.
- Student-scoped portfolio-read UI and the completion/export/deletion surfaces
  (issue #10/#11).
- Firestore composite indexes for the new collections — declared when the
  emulator/index config lands.
