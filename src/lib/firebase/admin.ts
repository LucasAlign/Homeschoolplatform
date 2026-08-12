// Server-side Firebase Admin SDK init (module boundary for all server writes).
// Admin SDK bypasses security rules — callers MUST authorize() first.
//
// Emulator-aware: when FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
// are set (see `npm run emulators`), the Admin SDK connects to the local suite
// automatically and no service-account credentials are required.

import { getApps, initializeApp, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const projectId = process.env.GCLOUD_PROJECT
  ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  ?? 'lucas-align-dev';

function initAdmin(): App {
  const existing = getApps();
  if (existing.length) return existing[0];

  const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  if (usingEmulator) {
    // No credentials needed against the emulator.
    return initializeApp({ projectId });
  }

  // Production: prefer an explicit service account, else application default.
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (saJson) {
    return initializeApp({ credential: cert(JSON.parse(saJson)), projectId });
  }
  return initializeApp({ credential: applicationDefault(), projectId });
}

const app = initAdmin();

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);
export { FieldValue };
