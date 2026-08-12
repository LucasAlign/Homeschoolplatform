// Module — Pilot: metadata-only telemetry validation (pure logic, unit-tested).
//
// The HARD, testable rule (§15/§18): NO Student content, PII, Evidence/Submission
// bodies, answer-key material, or raw AI prompts/outputs may EVER enter telemetry.
// The `TelemetryEvent` type is already closed by construction; this is the runtime
// half — a fail-closed guard that rejects any object carrying a key outside the
// allowlist, a content/PII-suggestive key, or a pseudonymous id that looks like a
// raw id / email (a real id or address is itself PII). It is pure and does no I/O;
// the server calls it before every write so a content field can never be persisted.

import {
  ALLOWED_TELEMETRY_KEYS,
  DISALLOWED_KEY_SUBSTRINGS,
  type TelemetryEvent,
} from './types';

export class TelemetryPrivacyError extends Error {
  constructor(reason: string) {
    super(`telemetry rejected (metadata-only): ${reason}`);
    this.name = 'TelemetryPrivacyError';
  }
}

// An `@`-bearing string is an email; a long undelimited hex/uuid-ish string is a
// raw id. Pseudonymous refs are expected to be a short salted-hash token, so we
// reject anything that reads like a real identifier leaking through.
const EMAIL_RE = /@/;
const RAW_ID_RE = /^[0-9a-f]{16,}$/i; // long hex — a raw doc id / uid, not a pseudonym

function isPseudonymousRef(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (EMAIL_RE.test(value)) return false;
  if (RAW_ID_RE.test(value)) return false;
  return true;
}

/**
 * Throw unless `candidate` is a metadata-only telemetry payload. Fail-closed:
 * anything not provably metadata is rejected. Checks, in order:
 *   1. it is a non-null object (not an array);
 *   2. every key is in the allowlist AND contains no content/PII substring;
 *   3. the pseudonymous refs are not raw ids / emails;
 *   4. numeric metadata are finite non-negative numbers in range.
 */
export function assertMetadataOnly(candidate: unknown): asserts candidate is TelemetryEvent {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TelemetryPrivacyError('payload is not an object');
  }
  const obj = candidate as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_TELEMETRY_KEYS.has(key)) {
      throw new TelemetryPrivacyError(`disallowed field "${key}" (not a known metadatum)`);
    }
    const lower = key.toLowerCase();
    for (const bad of DISALLOWED_KEY_SUBSTRINGS) {
      if (lower.includes(bad)) {
        throw new TelemetryPrivacyError(`field "${key}" reads as content/PII ("${bad}")`);
      }
    }
  }

  if (!isPseudonymousRef(obj.householdRef)) {
    throw new TelemetryPrivacyError('householdRef must be a pseudonymous token, not a raw id/email');
  }
  if (obj.studentRef !== undefined && !isPseudonymousRef(obj.studentRef)) {
    throw new TelemetryPrivacyError('studentRef must be a pseudonymous token, not a raw id/email');
  }

  // Numeric metadata bounds — a stray huge/negative/NaN value signals a bug or a
  // mis-mapped field. Content can't hide in a number, but we keep them sane.
  const numericFields: (keyof TelemetryEvent)[] = [
    'durationMs',
    'count',
    'costUnits',
    'usefulnessScore',
    'at',
  ];
  for (const f of numericFields) {
    const v = obj[f as string];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new TelemetryPrivacyError(`numeric field "${String(f)}" must be a finite, non-negative number`);
    }
  }
  if (typeof obj.usefulnessScore === 'number' && (obj.usefulnessScore < 1 || obj.usefulnessScore > 5)) {
    throw new TelemetryPrivacyError('usefulnessScore must be on the 1–5 ordinal');
  }
}

/** Boolean convenience wrapper; never throws. */
export function isMetadataOnly(candidate: unknown): candidate is TelemetryEvent {
  try {
    assertMetadataOnly(candidate);
    return true;
  } catch {
    return false;
  }
}
