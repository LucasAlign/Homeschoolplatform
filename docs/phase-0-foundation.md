# Phase 0 — Foundation

The Firebase foundation for Lucas Align: identity/roles, the consent gate, the
audit log, and security rules that encode the non-waivable invariants. This is
the base every later phase builds on. Source of truth:
[`mvp-specification.md`](mvp-specification.md).

## What this phase ships

- **Firebase config & Emulator Suite** — `firebase.json`, `.firebaserc`, and the
  Auth/Firestore/Storage/Functions emulators.
- **Security rules** — `firestore.rules` and `storage.rules`, deny-by-default,
  encoding household isolation, role scoping, Instructor-Reviewer student scope,
  answer-key isolation, client-immutable consent, and server-only immutable audit.
- **Module A — Identity & Access** (`src/modules/identity/`) — the `Role` set, the
  canonical `(role × record × action)` capability matrix, and the server-side
  fail-closed `authorize()` helper the Admin SDK must call.
- **Module K — Consent** (`src/modules/consent/`) — the consent state machine,
  forward-only `transitionConsent`, and `assertCollectionAllowed` (the gate every
  child-data write awaits).
- **Module L — Audit** (`src/modules/audit/`) — the append-only `recordAudit` writer.
- **Firebase SDK init** — `src/lib/firebase/client.ts` (browser, emulator-aware,
  App Check) and `src/lib/firebase/admin.ts` (server, emulator-aware).

## Setup

```bash
npm install                     # pulls firebase, firebase-admin, firebase-tools, vitest
cp .env.example .env.local      # fill Firebase web config; keep the emulator flag "true" for local
```

Creating the actual Firebase project (region **`us-east4`**, immutable) and its
Auth/App Check/billing is an account-level action performed in the Firebase/GCP
console by the Household/Owner of the cloud project — it is not scripted here.

## Run locally

```bash
npm run emulators        # start Auth + Firestore + Storage + Functions + UI (http://127.0.0.1:4000)
npm run emulators:seed   # (emulator running) seed a demo household, owner, and student
```

## Exit gate

Phase 0 is done when the rules tests pass — household isolation, role scoping,
answer-key isolation, consent-field immutability, and non-writable audit — against
the real rules:

```bash
npm run test:rules       # boots the Firestore emulator, runs tests/rules, tears down
```

## Not in this phase / deferred

- Real Firebase project provisioning, App Check enforcement keys, and billing
  (console/account actions).
- Auth UI and session wiring into the Next.js app (kept minimal; App-router
  integration lands as the first screens arrive in Phase 1).
- The legacy Prisma/SQLite scaffold (`prisma/`, `db:*` scripts) still exists and
  is removed once the Firestore data layer replaces it in Phase 1.
