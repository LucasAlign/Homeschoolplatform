// Phase 0 exit gate: prove household isolation, role-scoped access, answer-key
// isolation, and consent-field immutability against the real firestore.rules.
//
// Run with: `npm run test:rules` (spins up the Firestore emulator, runs these,
// tears down). Requires the emulator suite (firebase-tools) and vitest.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

const HID = 'h1';
const OWNER = 'owner';
const OTHER_HOUSEHOLD_USER = 'intruder';
const REVIEWER = 'reviewer';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'lucas-align-dev',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // Seed household, owner membership, a scoped reviewer, and two students.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `households/${HID}`), { id: HID, ownerUid: OWNER, displayName: 'H1' });
    await setDoc(doc(db, `households/${HID}/members/${OWNER}`), {
      uid: OWNER, role: 'household_owner', scopeStudentIds: [], scopeSubjects: [], elevations: {},
    });
    await setDoc(doc(db, `households/${HID}/members/${REVIEWER}`), {
      uid: REVIEWER, role: 'instructor_reviewer', scopeStudentIds: ['s1'], scopeSubjects: [], elevations: {},
    });
    await setDoc(doc(db, `households/${HID}/students/s1`), { id: 's1', consentState: 'Active' });
    await setDoc(doc(db, `households/${HID}/students/s2`), { id: 's2', consentState: 'Active' });
    await setDoc(doc(db, `households/${HID}/answerKeys/ak1`), { id: 'ak1', body: 'secret' });
  });
});

function db(uid: string) {
  return env.authenticatedContext(uid).firestore();
}

describe('household isolation (invariant 1)', () => {
  it('a member can read their household', async () => {
    await assertSucceeds(getDoc(doc(db(OWNER), `households/${HID}`)));
  });

  it('a non-member cannot read another household', async () => {
    await assertFails(getDoc(doc(db(OTHER_HOUSEHOLD_USER), `households/${HID}`)));
  });

  it('an unauthenticated user is denied', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `households/${HID}`)));
  });
});

describe('role scoping (invariant 3)', () => {
  it('owner can write memberships; reviewer cannot', async () => {
    await assertSucceeds(setDoc(doc(db(OWNER), `households/${HID}/members/x`), {
      uid: 'x', role: 'student', scopeStudentIds: [], scopeSubjects: [], elevations: {},
    }));
    await assertFails(setDoc(doc(db(REVIEWER), `households/${HID}/members/y`), { uid: 'y', role: 'student' }));
  });

  it('reviewer reads only assigned students', async () => {
    await assertSucceeds(getDoc(doc(db(REVIEWER), `households/${HID}/students/s1`)));
    await assertFails(getDoc(doc(db(REVIEWER), `households/${HID}/students/s2`)));
  });
});

describe('answer-key isolation (invariant 2)', () => {
  it('no member may read answer keys from the client', async () => {
    await assertFails(getDoc(doc(db(OWNER), `households/${HID}/answerKeys/ak1`)));
  });
});

describe('consent-field immutability (invariant 6)', () => {
  it('a parent cannot change a student consentState from the client', async () => {
    await assertFails(
      updateDoc(doc(db(OWNER), `households/${HID}/students/s1`), { consentState: 'Revoked' }),
    );
  });

  it('a parent may update other student fields', async () => {
    await assertSucceeds(
      updateDoc(doc(db(OWNER), `households/${HID}/students/s1`), { displayName: 'Renamed' }),
    );
  });
});

describe('audit is not client-writable (invariant 9)', () => {
  it('owner can read audit but not write it', async () => {
    await assertFails(setDoc(doc(db(OWNER), `households/${HID}/audit/e1`), { id: 'e1' }));
    await assertSucceeds(getDoc(doc(db(OWNER), `households/${HID}/audit/none`)));
  });
});
