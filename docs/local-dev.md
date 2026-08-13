# Local dev — click through the parent-approval flows

Run the two parent-gate UIs (curriculum **Approvals** and **Grades**) against the
Firebase Emulator Suite with demo data.

## Prerequisites

- **JDK 11+** — the Firestore emulator is Java. Check with `java -version`; if it
  reports `1.8`, install a newer JDK (e.g. `winget install EclipseAdoptium.Temurin.21.JDK`).
  Without it the emulator will not boot.
  - **Gotcha:** an old Oracle Java can keep shadowing the new one on `PATH` (via
    `C:\Program Files (x86)\Common Files\Oracle\Java\javapath`). firebase-tools
    honors **`JAVA_HOME`**, so the reliable fix is to ensure `JAVA_HOME` points at
    the new JDK (the Temurin installer sets it machine-wide) and open a **fresh
    terminal** so it's picked up. Verify the emulator picks it up — the startup
    banner should not warn about an unsupported Java version. If it still does,
    set it for the session first, e.g. PowerShell:
    `$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot'`.
- `firebase-tools` (already a dev dependency) and `npm ci` done once.
- `.env.local` — already generated with the emulator hosts and the dev-session
  principal. (It's gitignored; see `.env.example` for the documented keys.)

## Steps

Three terminals from the repo root:

```bash
# 1) Start the emulators (persistent — leave running)
npm run emulators
```

```bash
# 2) Seed demo data into the running emulator
npm run seed
```

```bash
# 3) Start the app
npm run dev
```

Then open:

- **http://localhost:3000/approvals** — three curriculum imports awaiting the
  parent gate: one **batch-eligible** (Saxon Math), two that need individual
  review (a cut-off page; a low-confidence handwritten packet). Open one to see
  the extracted lesson/assignment tree with per-item confidence and source-page
  provenance, then **Approve** (materializes a Course), **Request correction**,
  or **Reject**.
- **http://localhost:3000/grades** — five AI assessments across all four routing
  lanes: **batch** (objective, high confidence), **individual** (subjective
  rubric), **manual** (low confidence, and a hard-swing resubmission that shows
  the current grade), **parent-only** (not AI-assessable, no number). Open one to
  see the full disclosure envelope, then **Accept the AI suggestion** or enter a
  **final score to override** (the divergence is recorded).

The **Approve all N ready** button on each queue clears the batch-eligible items
in one pass.

## Who am I signed in as?

There is **no real auth yet** (see [`launch-readiness.md`](launch-readiness.md)
§B.6). `src/lib/auth/session.ts` resolves a dev session that defaults to the
seeded Household Owner (`owner-uid` / `demo-household`). Override with
`DEV_SESSION_UID` / `DEV_SESSION_HOUSEHOLD` in `.env.local` to act as a different
seeded member (e.g. the `parent-uid` Parent Admin).

## Re-seeding

`npm run seed` is idempotent — every doc has a fixed id, so re-running overwrites
the demo set. To start from empty, stop the emulator (its data is in-memory) and
restart it. Note that once you approve an import/assessment, its queue row
disappears (the import becomes a Course; the assessment becomes an Official
Grade) — re-seed to get the pending items back.

## One-shot smoke check

`npm run emulators:seed` boots a throwaway emulator, runs the seed, and tears it
down — useful to confirm the seed executes, but the data does **not** persist for
`npm run dev`. Use the three-terminal flow above for click-through.
