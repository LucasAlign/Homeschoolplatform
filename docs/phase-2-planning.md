# Phase 2 — Planning & Scheduling (module C)

Turns an approved Course into a scheduled, parent-authorized plan: Proposed
Schedule → immutable **Plan Revision** → Approved Plan, with bounded Student
agency and pre-authorized reflow. Source: [`mvp-specification.md`](mvp-specification.md)
§5 (Planning) and issue #6.

## What this phase ships (`src/modules/planning/`)

- `types.ts` — PlanScope, ScheduledAssignment, ProposedSchedule, PlanRevision
  (immutable), ApprovedPlan (pointer), DeferralPolicy + config.
- `scheduling-logic.ts` — **pure, unit-tested** logic:
  - `resolveDeferralPolicy` (household → student → course, most specific wins)
  - `canReorderSameDay` / `validateDeferral` (bounded Student agency)
  - `dailyWorkload` / `withinWorkloadCap`
  - `isStaleProposal` (optimistic concurrency)
  - `validateReflow` (preserve fixed dates + sequence + caps)
  - `isWithinAutoReflowBounds` (same-week, pre-authorized auto-apply)
- `planning.ts` — operations:
  - `proposeSchedule` (advisory, tagged with the revision it was based on)
  - `approveProposal` (Parent Admin+; materializes one immutable Plan Revision
    under optimistic concurrency; supersession chain)
  - `studentDeferAssignment` (validates against policy; yields a revised
    proposal; auto-applies only within pre-authorized reflow bounds — attributed
    to `system:auto-reflow`, never the Student exercising approve)

## Invariants enforced

- Immutability via supersession: revisions are append-only; correction creates a
  new revision, never a mutation.
- Bounded Student agency: reorder/defer within policy only; a Student never
  mutates the Approved Plan or gains approve capability.
- Optimistic concurrency: a stale proposal cannot overwrite a newer revision.

## Verify (no emulator / JDK needed)

```bash
npm run test:unit      # includes 11 planning tests
```

## Deferred

- School Calendar model + schedule generation heuristics (workload/sequence/
  completion-target aware).
- Student-scoped plan reads (needs the student-uid ↔ Student-profile linkage).
- The planner/calendar UI (grades 4-8 checklist, 9-12 calendar) — issue #10.
