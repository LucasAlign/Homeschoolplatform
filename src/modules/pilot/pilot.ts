// Module — Pilot Readiness & Launch operations (server-only, Admin SDK).
//
// Pilot telemetry and the go/no-go scorecard are SERVER-WRITTEN; clients never
// write them (Firestore rules deny it, and the server is the single writer). The
// scorecard is a HOUSEHOLD-OWNER-only concern — the founder Household Owner is the
// launch decision-maker (§18) — so writing it authorizes fail-closed and is
// audited. Telemetry writes pass through `assertMetadataOnly` FIRST: a payload
// that is not provably content-free is rejected before it can be persisted
// (§15/§18), and only pseudonymous ids, timings, counts, cost, and outcomes land.
//
// The pseudonymous refs are produced upstream (a per-pilot salted hash of the
// Household/Student id); this module never dereferences them back to a real id.

import { adminDb } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { recordAudit } from '../audit/audit';
import { assertMetadataOnly } from './telemetry-validation';
import { evaluateScorecard } from './scorecard';
import type { Scorecard, ScorecardInput, TelemetryEvent } from './types';

export class PilotError extends Error {
  constructor(reason: string) {
    super(`pilot: ${reason}`);
    this.name = 'PilotError';
  }
}

function telemetryCol(hid: string) {
  return adminDb.collection(`households/${hid}/pilotTelemetry`);
}
function scorecardRef(hid: string) {
  return adminDb.doc(`households/${hid}/pilotScorecard/current`);
}

/**
 * Record one metadata-only pilot telemetry event for a household. The payload is
 * validated content-free (`assertMetadataOnly`) BEFORE the write; anything that
 * is not provably metadata throws and nothing is persisted (fail-closed §15/§18).
 * Server-written only — no client path exists.
 *
 * `householdId` is the real path scope (deny-by-default rules pin the collection
 * to the household); `event.householdRef` is the PSEUDONYMOUS token used in
 * exported aggregates. They are deliberately distinct.
 */
export async function recordTelemetry(args: {
  householdId: string;
  event: Omit<TelemetryEvent, 'id' | 'at'>;
}): Promise<TelemetryEvent> {
  const ref = telemetryCol(args.householdId).doc();
  const event: TelemetryEvent = { ...args.event, id: ref.id, at: Date.now() };

  // The hard rule, enforced at the boundary: reject any content/PII before write.
  assertMetadataOnly(event);

  await ref.create(event); // create() over set() — telemetry events are append-only
  return event;
}

/**
 * Evaluate and persist the launch go/no-go scorecard for a household —
 * HOUSEHOLD-OWNER-only (the founder is the launch decision-maker, §18). The
 * evaluation is a pure function of the supplied inputs; this op authorizes,
 * writes the immutable-by-supersession result, and audits the DECISION only
 * (content-free — the audit records GO/NO-GO and the blocking-reason count, never
 * the underlying data).
 */
export async function evaluateAndWriteScorecard(args: {
  uid: string;
  householdId: string;
  input: ScorecardInput;
}): Promise<Scorecard> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'pilot_scorecard',
    action: 'approve',
  });

  const scorecard = evaluateScorecard(args.input);

  await scorecardRef(args.householdId).set(scorecard);

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'approve',
    recordType: 'pilot_scorecard',
    recordId: 'current',
    detail: `scorecard evaluated: ${scorecard.decision}; blockingReasons=${scorecard.blockingReasons.length}`,
  });

  return scorecard;
}
