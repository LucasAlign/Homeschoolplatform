// Server-side session resolution — the seam between an authenticated request and
// the (uid, householdId, role) the domain layer authorizes against.
//
// ⚠️ NOT REAL AUTH YET. Real session wiring (Firebase Auth session cookie →
// verified uid, App Check, and the uid ↔ Household-membership lookup that also
// gates student-scoped reads) is deferred — see docs/launch-readiness.md §B.6.
// Until then this returns a DEV session so the UI can be built and exercised
// against the emulator, and it HARD-FAILS in production so a real deployment can
// never run on the stub. Every domain call still goes through server-side
// `authorize()`, so this seam picks the principal but never grants authority.
//
// Import only from server components / Server Actions (it reads server env and
// feeds the Admin SDK path); it is never bundled to a client component.

export interface Session {
  uid: string;
  householdId: string;
}

/** True when we're allowed to fall back to the dev session (never in prod). */
function devFallbackAllowed(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true'
  );
}

/**
 * Resolves the current session, or `null` if unauthenticated.
 *
 * Dev/emulator: reads DEV_SESSION_UID / DEV_SESSION_HOUSEHOLD (falling back to
 * the seeded emulator household) so the approval UI has a principal to act as.
 * Production without the real session layer: throws, by design.
 */
export async function getSession(): Promise<Session | null> {
  if (!devFallbackAllowed()) {
    throw new Error(
      'session layer not implemented: real Firebase Auth session cookies are ' +
        'required in production (see docs/launch-readiness.md §B.6)',
    );
  }
  // Defaults match the demo principal seeded by scripts/seed-emulator.ts, so a
  // freshly-seeded emulator + `npm run dev` is signed in as the seeded owner
  // with no extra config. Override via DEV_SESSION_UID / DEV_SESSION_HOUSEHOLD.
  return {
    uid: process.env.DEV_SESSION_UID ?? 'owner-uid',
    householdId: process.env.DEV_SESSION_HOUSEHOLD ?? 'demo-household',
  };
}

/** Session or throw — for surfaces that must have a principal. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error('unauthenticated');
  return session;
}
