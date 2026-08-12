// Seeds the local Firestore emulator with one Household, an owner membership,
// and a Student (consent NotRequested). Run via `npm run emulators:seed`
// (the emulator must be running, or use `firebase emulators:exec`).

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT ?? 'lucas-align-dev';
const app = initializeApp({ projectId });
const db = getFirestore(app);

async function seed() {
  const hid = 'demo-household';
  const ownerUid = 'owner-uid';

  await db.doc(`households/${hid}`).set({
    id: hid,
    ownerUid,
    displayName: 'Demo Household',
    createdAt: Date.now(),
  });

  await db.doc(`households/${hid}/members/${ownerUid}`).set({
    uid: ownerUid,
    role: 'household_owner',
    scopeStudentIds: [],
    scopeSubjects: [],
    elevations: {},
    createdAt: Date.now(),
  });

  await db.doc(`households/${hid}/students/first-student`).set({
    id: 'first-student',
    displayName: 'First Student',
    gradeBand: '4-8',
    consentState: 'NotRequested',
    createdAt: Date.now(),
  });

  console.log(`Seeded household ${hid} with owner ${ownerUid} and one student.`);
}

seed().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
