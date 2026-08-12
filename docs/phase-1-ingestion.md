# Phase 1 — Curriculum Ingestion (modules B + J)

The MVP core loop's first half: import → OCR → extraction → **parent-approved**
Course draft, with answer-key isolation and every AI call metered and capped.
Source of truth: [`mvp-specification.md`](mvp-specification.md) §5, §6, §12.

## What this phase ships

**Module B — Curriculum Ingestion** (`src/modules/ingestion/`)
- `state-machine.ts` — the Import lifecycle (`Uploading → … → ExtractedDraft →
  Approved`, with `NeedsCorrection` / `Failed` / `Rejected`), guarded transitions.
- `import.ts` — `createImport` (rights attestation + material-role tagging;
  adult-only material filed isolated) and `advanceImportState`.
- `worker.ts` — idempotent async processing (OCR + structuring via module J),
  producing an advisory `ExtractedDraft`.
- `approval-policy.ts` / `approve.ts` — the parent gate; batch approval only for
  high-confidence, internally-consistent, unflagged drafts; materializes a Course.

**Module J — AI Policy Gateway & Metering** (`src/modules/ai-gateway/`)
- `gateway.ts` — `invokeAI()`, the single choke point: authorize → consent gate
  (Student ops only) → enforcement ladder → provider → meter → audit.
- `metering.ts` — the pure enforcement ladder (Essential never budget-denied).
- `providers.ts` — `AIProvider` interface + `StubProvider`. Real Vertex AI /
  Document AI / Cloud Vision providers (US-region) are wired here with
  credentials during implementation.

## Verify (no emulator / JDK needed)

```bash
npm run test:unit      # 18 tests: state machine, material isolation, batch policy, enforcement ladder
```

## Exit gate (still to satisfy)

- Trustworthy draft approvable in < 10 active minutes (needs the import/review UI).
- **Zero answer-key leakage** — proven end-to-end once the emulator rules tests
  run (JDK 11+) and the real OCR/extraction path exists.
- Cost caps enforced under load (the ingestion benchmark empirical run, issue #17).

## Not in this phase / deferred

- Real OCR/multimodal vendor integration (credentials + US-region endpoints).
- The parent import & approval UI (prototype decisions in issue #9).
- Firestore-touching integration tests (need the emulator / JDK 11+).
