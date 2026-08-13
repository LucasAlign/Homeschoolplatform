// Seeds the local Firestore emulator with a demo Household and enough data to
// click through BOTH parent-approval flows:
//   • Curriculum approvals (module B): imports in `ExtractedDraft` awaiting the
//     parent gate — one batch-eligible, some that need individual review.
//   • Grade approvals (module E): AI assessments in `AssessmentReady` across all
//     four routing lanes (batch / individual / manual / parent-only), plus a
//     resubmission with a prior Official Grade to show suggested-vs-final.
//
// The demo principal (`owner-uid` / `demo-household`) is what src/lib/auth/
// session.ts resolves to in dev, so the seeded owner IS the signed-in parent.
//
// Two ways to run:
//   • Against a PERSISTENT emulator (for click-through):
//       Terminal A:  npm run emulators
//       Terminal B:  npm run seed          # this file; data stays for `npm run dev`
//   • One-shot (throwaway emulator, e.g. a smoke check):
//       npm run emulators:seed             # firebase emulators:exec wraps this
//
// Idempotent: every doc has a fixed id, so re-running overwrites cleanly.

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
// Type-only imports (stripped at runtime): they make the seeded documents
// correct-by-construction against the SAME domain types the UI reads, so a shape
// mismatch fails `npx tsc --noEmit` instead of only surfacing at click-through.
import type {
  ExtractedDraft,
  ImportJob,
  MaterialRole,
  QualityFlag,
} from '../src/modules/ingestion/types';
import type {
  AIAssessment,
  AssessabilityClass,
  DisclosureEnvelope,
  OfficialGrade,
} from '../src/modules/assessment/types';
import type {
  ApprovedPlan,
  PlanRevision,
  PlanScope,
  ProposedSchedule,
  ScheduledAssignment,
} from '../src/modules/planning/types';

// Default to the standard emulator host/port when not already provided (a bare
// `npm run seed` against a running emulator). `firebase emulators:exec` sets
// these itself, so this never clobbers the exec path.
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ??= 'lucas-align-dev';

const HID = 'demo-household';
const OWNER = 'owner-uid';
const PARENT = 'parent-uid';
const S1 = 'first-student';
const S2 = 'second-student';

const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);

const now = Date.now();
const doc = (path: string) => db.doc(`households/${HID}/${path}`);

async function seedHousehold() {
  await db.doc(`households/${HID}`).set({
    id: HID,
    ownerUid: OWNER,
    displayName: 'Demo Household',
    createdAt: now,
  });

  await doc(`members/${OWNER}`).set({
    uid: OWNER,
    role: 'household_owner',
    scopeStudentIds: [],
    scopeSubjects: [],
    elevations: {},
    createdAt: now,
  });
  await doc(`members/${PARENT}`).set({
    uid: PARENT,
    role: 'parent_admin',
    scopeStudentIds: [],
    scopeSubjects: [],
    elevations: {},
    createdAt: now,
  });

  await doc(`students/${S1}`).set({
    id: S1,
    displayName: 'First Student',
    gradeBand: '4-8',
    consentState: 'Active',
    createdAt: now,
  });
  await doc(`students/${S2}`).set({
    id: S2,
    displayName: 'Second Student',
    gradeBand: '9-12',
    consentState: 'Active',
    createdAt: now,
  });
}

// --- Module B: curriculum imports awaiting parent approval ---

function importJob(id: string, materialRole: MaterialRole, flags: QualityFlag[]): ImportJob {
  return {
    id,
    householdId: HID,
    curriculumSourceId: `src-${id}`,
    uploaderUid: OWNER,
    materialRole,
    state: 'ExtractedDraft',
    rightsAttested: true,
    originalHash: `hash-${id}`,
    idempotencyKey: `idem-${id}`,
    qualityFlags: flags,
    createdAt: now,
    updatedAt: now,
  };
}

const IMPORTS: { job: ImportJob; draft: ExtractedDraft }[] = [
  {
    // High-confidence, consistent, no blocking flag → batch-eligible.
    job: importJob('imp-batch', 'student', []),
    draft: {
      importId: 'imp-batch',
      courseTitle: 'Saxon Math 6/5',
      overallConfidence: 0.95,
      internallyConsistent: true,
      qualityFlags: [],
      lessons: [
        {
          title: 'Lesson 1 — Adding Whole Numbers',
          order: 1,
          confidence: 0.97,
          assignments: [
            { title: 'Practice Set A', confidence: 0.96, provenance: { sourcePage: 12 } },
            { title: 'Mixed Practice 1–20', confidence: 0.95, provenance: { sourcePage: 13 } },
          ],
        },
        {
          title: 'Lesson 2 — Subtracting Whole Numbers',
          order: 2,
          confidence: 0.94,
          assignments: [{ title: 'Practice Set B', confidence: 0.93, provenance: { sourcePage: 16 } }],
        },
      ],
    },
  },
  {
    // A cut-off page (blocking flag) → drops to individual review.
    job: importJob('imp-review', 'student', [{ kind: 'cutoff', page: 3 }]),
    draft: {
      importId: 'imp-review',
      courseTitle: 'Story of the World Vol. 2',
      overallConfidence: 0.82,
      internallyConsistent: true,
      qualityFlags: [{ kind: 'cutoff', page: 3 }],
      lessons: [
        {
          title: 'Chapter 1 — The Roman Empire',
          order: 1,
          confidence: 0.86,
          assignments: [
            { title: 'Narration Exercise', confidence: 0.8, provenance: { sourcePage: 2 } },
            { title: 'Map Work (page cut off)', confidence: 0.55, provenance: { sourcePage: 3 } },
          ],
        },
      ],
    },
  },
  {
    // Low overall confidence + inconsistency → individual review.
    job: importJob('imp-lowconf', 'student', [{ kind: 'low_confidence', page: 1 }]),
    draft: {
      importId: 'imp-lowconf',
      courseTitle: 'Handwritten Co-op Science Packet',
      overallConfidence: 0.61,
      internallyConsistent: false,
      qualityFlags: [
        { kind: 'low_confidence', page: 1 },
        { kind: 'blur', page: 4 },
      ],
      lessons: [
        {
          title: 'Unit — Photosynthesis',
          order: 1,
          confidence: 0.6,
          assignments: [{ title: 'Lab: Leaf Observation', confidence: 0.58, provenance: { sourcePage: 4 } }],
        },
      ],
    },
  },
];

async function seedImports() {
  for (const { job, draft } of IMPORTS) {
    await doc(`imports/${job.id}`).set(job);
    await doc(`imports/${job.id}/draft/current`).set(draft);
  }
}

// --- Module E: AI assessments awaiting the parent grade gate ---

function envelope(over: Partial<DisclosureEnvelope> = {}): DisclosureEnvelope {
  return {
    suggestedScore: 0.9,
    rationale: 'Answers matched the expected keys; work shown is consistent.',
    confidence: 0.95,
    uncertainty: { unreadPortions: [], notes: '' },
    assistance: { supportEventCount: 0, usedAICount: 0, hardStopCount: 0 },
    evidenceExamined: ['ev-1'],
    ...over,
  };
}

function assessment(
  id: string,
  assignmentId: string,
  studentId: string,
  assessabilityClass: AssessabilityClass,
  env: DisclosureEnvelope,
): AIAssessment {
  return {
    id,
    submissionId: `sub-${id}`,
    assignmentId,
    studentId,
    state: 'AssessmentReady',
    assessabilityClass,
    envelope: env,
    supersedesAssessmentId: null,
    aiProvenance: { vendor: 'stub', model: 'stub-assess-v0', feature: 'assessment' },
    createdAt: now,
    updatedAt: now,
  };
}

const ASSESSMENTS = [
  // Objective, high confidence, no forcing signal → batch-eligible.
  assessment('asmt-objective', 'assign-add', S1, 'objective-autoscorable', envelope()),
  // Subjective rubric → individual review even at high confidence.
  assessment(
    'asmt-subjective',
    'assign-essay',
    S1,
    'subjective-rubric',
    envelope({
      suggestedScore: 0.8,
      rationale: 'Thesis is clear; two supporting paragraphs; conclusion thin.',
      confidence: 0.9,
      uncertainty: { unreadPortions: ['final paragraph partially legible'], notes: 'handwriting' },
      evidenceExamined: ['ev-essay-1', 'ev-essay-2'],
    }),
  ),
  // Low confidence → manual review.
  assessment(
    'asmt-lowconf',
    'assign-fractions',
    S2,
    'objective-autoscorable',
    envelope({
      suggestedScore: 0.7,
      confidence: 0.5,
      rationale: 'Several answers ambiguous; scan quality low.',
      uncertainty: { unreadPortions: ['problems 4–7 unreadable'], notes: 'glare on lower half' },
    }),
  ),
  // Not assessable → straight to the parent, no number.
  assessment(
    'asmt-notassessable',
    'assign-observation',
    S2,
    'not-assessable-needs-adult',
    envelope({
      suggestedScore: null,
      confidence: null,
      uncertainty: null,
      rationale: 'Observation-based task; no gradable artifact for the AI to read.',
      assistance: { supportEventCount: 2, usedAICount: 1, hardStopCount: 0 },
      evidenceExamined: [],
    }),
  ),
  // High-confidence objective BUT a resubmission that swings hard from the prior
  // grade → forced to manual; the review screen shows the current grade.
  assessment(
    'asmt-resub',
    'assign-add-2',
    S1,
    'objective-autoscorable',
    envelope({ suggestedScore: 0.95, rationale: 'Retake — nearly all correct this time.' }),
  ),
];

// Prior Official Grade for the resubmission's assignment (finalScore 0.6) so the
// new suggestion (0.95) is a large swing → manual, and "current grade" shows.
const PRIOR_GRADE: OfficialGrade = {
  id: 'grade-resub-v1',
  assignmentId: 'assign-add-2',
  studentId: S1,
  submissionId: 'sub-asmt-resub-v0',
  sourceAssessmentId: 'asmt-resub-v0', // a DIFFERENT (earlier) assessment
  version: 1,
  supersedesGradeId: null,
  suggestedScore: 0.6,
  finalScore: 0.6,
  parentOverride: false,
  approvedByUid: OWNER,
  viaBatch: false,
  createdAt: now - 86_400_000,
};

async function seedGrades() {
  for (const a of ASSESSMENTS) {
    await doc(`aiAssessments/${a.id}`).set(a);
  }
  await doc(`officialGrades/${PRIOR_GRADE.id}`).set(PRIOR_GRADE);
}

// --- Module C: proposed schedules awaiting the parent plan gate ---

const scopeKey = (s: PlanScope) => `${s.studentId}__${s.schoolYearId}`;

function placement(
  assignmentId: string,
  courseId: string,
  date: string,
  order: number,
  sequenceIndex: number,
  opts: { fixed?: boolean; deferrable?: boolean; workloadUnits?: number } = {},
): ScheduledAssignment {
  return {
    assignmentId,
    courseId,
    date,
    order,
    sequenceIndex,
    fixed: opts.fixed ?? false,
    deferrable: opts.deferrable ?? true,
    workloadUnits: opts.workloadUnits ?? 2,
  };
}

// Scope A (S1): no existing plan → a first "full" proposal (shows as a new plan).
const SCOPE_A: PlanScope = { studentId: S1, schoolYearId: 'sy-2026' };
const PROP_NEW: ProposedSchedule = {
  id: 'prop-new',
  scope: SCOPE_A,
  kind: 'full',
  placements: [
    placement('a-math-1', 'c-math', '2026-09-01', 0, 0),
    placement('a-hist-1', 'c-hist', '2026-09-01', 1, 1, { fixed: true, deferrable: false, workloadUnits: 1 }),
    placement('a-math-2', 'c-math', '2026-09-02', 0, 2),
  ],
  basedOnRevisionId: null,
  advisory: true,
  createdAt: now,
};

// Scope B (S2): an existing revision + a change_set that moves one assignment,
// plus a STALE proposal (built on an older revision) that the queue must hide.
const SCOPE_B: PlanScope = { studentId: S2, schoolYearId: 'sy-2026' };
const REV_B1_PLACEMENTS: ScheduledAssignment[] = [
  placement('b-sci-1', 'c-sci', '2026-09-01', 0, 0),
  placement('b-sci-2', 'c-sci', '2026-09-02', 0, 1),
  placement('b-sci-3', 'c-sci', '2026-09-03', 0, 2),
];
const REV_B1: PlanRevision = {
  id: 'rev-s2-1',
  scope: SCOPE_B,
  revisionNumber: 1,
  effectiveDate: '2026-08-15',
  placements: REV_B1_PLACEMENTS,
  supersedesRevisionId: null,
  approvedByUid: OWNER,
  createdAt: now - 86_400_000,
};
const PLAN_B: ApprovedPlan = {
  scope: SCOPE_B,
  currentRevisionId: REV_B1.id,
  currentRevisionNumber: 1,
  updatedAt: now - 86_400_000,
};
const PROP_CHANGE: ProposedSchedule = {
  id: 'prop-change',
  scope: SCOPE_B,
  kind: 'change_set',
  // b-sci-2 deferred 09-02 → 09-04 (one moved item in the diff).
  placements: REV_B1_PLACEMENTS.map((p) =>
    p.assignmentId === 'b-sci-2' ? { ...p, date: '2026-09-04' } : p,
  ),
  basedOnRevisionId: REV_B1.id,
  advisory: true,
  createdAt: now,
};
const PROP_STALE: ProposedSchedule = {
  id: 'prop-stale',
  scope: SCOPE_B,
  kind: 'change_set',
  placements: REV_B1_PLACEMENTS,
  basedOnRevisionId: 'rev-s2-0', // built on a superseded revision → hidden by the queue
  advisory: true,
  createdAt: now,
};

async function seedPlans() {
  await doc(`planRevisions/${REV_B1.id}`).set(REV_B1);
  await doc(`plans/${scopeKey(SCOPE_B)}`).set(PLAN_B);
  for (const p of [PROP_NEW, PROP_CHANGE, PROP_STALE]) {
    await doc(`proposals/${p.id}`).set(p);
  }
}

async function main() {
  await seedHousehold();
  await seedImports();
  await seedGrades();
  await seedPlans();
  console.log(
    `Seeded ${HID}: owner ${OWNER} + parent ${PARENT}, 2 students, ` +
      `${IMPORTS.length} imports awaiting approval, ${ASSESSMENTS.length} assessments awaiting grading, ` +
      `2 plan proposals awaiting approval (+1 stale, hidden).`,
  );
  console.log(`Emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
