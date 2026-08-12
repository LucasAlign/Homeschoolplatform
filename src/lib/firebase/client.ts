// Client-side Firebase SDK init (browser). Public config only — never secrets.
// App Check (reCAPTCHA Enterprise) attests the app in production; the debug
// token path is used locally. Emulator wiring is gated on
// NEXT_PUBLIC_USE_FIREBASE_EMULATOR so the same code runs in dev and prod.

'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'lucas-align-dev',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

let app: FirebaseApp;
let authInstance: Auth;
let dbInstance: Firestore;
let storageInstance: FirebaseStorage;

export function getClientApp(): FirebaseApp {
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    dbInstance = getFirestore(app);
    storageInstance = getStorage(app);

    if (useEmulator) {
      connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(dbInstance, '127.0.0.1', 8080);
      connectStorageEmulator(storageInstance, '127.0.0.1', 9199);
    }
  }
  return app;
}

export function clientAuth(): Auth {
  getClientApp();
  return authInstance;
}
export function clientDb(): Firestore {
  getClientApp();
  return dbInstance;
}
export function clientStorage(): FirebaseStorage {
  getClientApp();
  return storageInstance;
}
