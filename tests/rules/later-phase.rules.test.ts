// Rules tests for the later-phase collections (modules B–J, Phases 1–8).
// Complements foundation.rules.test.ts (Phase 0). Verifies four access patterns
// + the universal server-written (write: false) posture, against the real rules.
//
// Run with `npm run test:rules` (needs the Firestore emulator / JDK 11+; runs in CI).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

const HID = 'h1';
const OWNER = 'owner';
const PARENT = 'parent';
const REVIEWER = 'reviewer'; // assigned to s1 only
const STUDENT = 'student';
const INTRUDER = 'intruder'; // not a member of h1

// Collections that adults read and no client writes.
const ADULT_READ = [
  'imports/i1',
  'courses/c1',
  'proposals/p1',
  'planRevisions/r1',
  'plans/k1',
  'submissions/sub1',
  'evidence/e1',
  'supportEvents/se1',
  'aiAssessments/a1',
  'officialGrades/g1',
  'masteryRecords/m1',
  'remediationDrafts/rd1',
];

// Collections read by the Owner ONLY.
const OWNER_ONLY = [
  'deletionLedger/dl1',
  'allowance/current',
  'subscriptions/subA',
  'overageConsents/oc1',
  'consents/con1',
  'pilotTelemetry/t1',
  'pilotScorecard/sc1',
];

// Student-scoped: adult-read gated by reviewerCanSeeStudent(resource.data.studentId).
const REVIEWER_SCOPED = ['reviewFlags', 'schoolYears', 'portfolioSnapshots', 'notifications'];

// Every later-phase collection is server-written (no client write at all).
const ALL_WRITE_FALSE = [
  ...ADULT_READ,
  ...OWNER_ONLY,
  'reviewFlags/f1',
  'schoolYears/y1',
  'portfolioSnapshots/ps1',
  'notifications/n1',
  'imports/i1/draft/current',
];

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'lucas-align-dev',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

function path(rel: string): string {
  return `households/${HID}/${rel}`;
}
function db(uid: string) {
  return env.authenticatedContext(uid).firestore();
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, `households/${HID}`), { id: HID, ownerUid: OWNER });
    await setDoc(doc(d, path(`members/${OWNER}`)), { uid: OWNER, role: 'household_owner', scopeStudentIds: [] });
    await setDoc(doc(d, path(`members/${PARENT}`)), { uid: PARENT, role: 'parent_admin', scopeStudentIds: [] });
    await setDoc(doc(d, path(`members/${REVIEWER}`)), { uid: REVIEWER, role: 'instructor_reviewer', scopeStudentIds: ['s1'] });
    await setDoc(doc(d, path(`members/${STUDENT}`)), { uid: STUDENT, role: 'student', scopeStudentIds: [] });
    await setDoc(doc(d, path('students/s1')), { id: 's1', consentState: 'Active' });
    await setDoc(doc(d, path('students/s2')), { id: 's2', consentState: 'Active' });

    for (const rel of [...ADULT_READ, ...OWNER_ONLY]) {
      await setDoc(doc(d, path(rel)), { seeded: true });
    }
    await setDoc(doc(d, path('imports/i1/draft/current')), { seeded: true });
    // Student-scoped docs: one in scope (s1), one out (s2).
    for (const col of REVIEWER_SCOPED) {
      await setDoc(doc(d, path(`${col}/inScope`)), { studentId: 's1' });
      await setDoc(doc(d, path(`${col}/outScope`)), { studentId: 's2' });
    }
  });
});

describe('server-written: no client may write later-phase collections', () => {
  it('the Household Owner cannot create in any of them', async () => {
    for (const rel of ALL_WRITE_FALSE) {
      await assertFails(setDoc(doc(db(OWNER), path(`${rel}-new`)), { x: 1 }));
    }
  });

  it('immutable records reject client update and delete', async () => {
    for (const rel of ['officialGrades/g1', 'planRevisions/r1', 'portfolioSnapshots/ps1']) {
      // portfolioSnapshots/ps1 does not exist (reviewer-scoped seeds use inScope/outScope),
      // so seed it explicitly for this immutability check.
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), path(rel)), { studentId: 's1', v: 1 });
      });
      await assertFails(updateDoc(doc(db(OWNER), path(rel)), { v: 2 }));
      await assertFails(deleteDoc(doc(db(OWNER), path(rel))));
    }
  });
});

describe('adult-read + household isolation', () => {
  it('an adult member reads adult-read collections', async () => {
    await assertSucceeds(getDoc(doc(db(OWNER), path('officialGrades/g1'))));
    await assertSucceeds(getDoc(doc(db(PARENT), path('submissions/sub1'))));
  });

  it('a non-member of the household is denied (isolation)', async () => {
    await assertFails(getDoc(doc(db(INTRUDER), path('officialGrades/g1'))));
    await assertFails(getDoc(doc(db(INTRUDER), path('courses/c1'))));
  });

  it('a Student may not read adult-only records', async () => {
    await assertFails(getDoc(doc(db(STUDENT), path('aiAssessments/a1'))));
    await assertFails(getDoc(doc(db(STUDENT), path('submissions/sub1'))));
  });
});

describe('owner-only collections', () => {
  it('only the Household Owner reads them', async () => {
    for (const rel of OWNER_ONLY) {
      await assertSucceeds(getDoc(doc(db(OWNER), path(rel))));
      await assertFails(getDoc(doc(db(PARENT), path(rel))));
      await assertFails(getDoc(doc(db(REVIEWER), path(rel))));
    }
  });
});

describe('reviewer scope on student-scoped collections', () => {
  it('a reviewer reads only assigned-student docs; adults read both', async () => {
    for (const col of REVIEWER_SCOPED) {
      await assertSucceeds(getDoc(doc(db(REVIEWER), path(`${col}/inScope`))));
      await assertFails(getDoc(doc(db(REVIEWER), path(`${col}/outScope`))));
      await assertSucceeds(getDoc(doc(db(OWNER), path(`${col}/outScope`))));
      await assertSucceeds(getDoc(doc(db(PARENT), path(`${col}/outScope`))));
    }
  });
});

describe('draft subcollection is parent-plus only', () => {
  it('parent+ reads a draft; reviewer and student cannot', async () => {
    await assertSucceeds(getDoc(doc(db(OWNER), path('imports/i1/draft/current'))));
    await assertSucceeds(getDoc(doc(db(PARENT), path('imports/i1/draft/current'))));
    await assertFails(getDoc(doc(db(REVIEWER), path('imports/i1/draft/current'))));
    await assertFails(getDoc(doc(db(STUDENT), path('imports/i1/draft/current'))));
  });
});
