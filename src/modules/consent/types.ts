// Module K — Consent, Retention & Deletion: canonical consent state machine.
// See docs/mvp-specification.md §14 and issue #15.
//
// Per-Student, per-purpose. Collection of child data is gated on `Active`.
// Transitions are forward-only; each writes a versioned consent receipt.

export const CONSENT_STATES = [
  'NotRequested',
  'Requested',
  'Active',
  'Revoked',
  'ReConsentRequired',
  'Abandoned',
] as const;

export type ConsentState = (typeof CONSENT_STATES)[number];

/** Purposes are unbundled so optional uses require separate consent. */
export type ConsentPurpose =
  | 'core_learning'
  | 'ai_processing'
  | 'pilot_analytics';

/** Allowed forward-only transitions. */
export const CONSENT_TRANSITIONS: Record<ConsentState, ConsentState[]> = {
  NotRequested: ['Requested'],
  Requested: ['Active', 'Abandoned'],
  Active: ['ReConsentRequired', 'Revoked'],
  ReConsentRequired: ['Active', 'Revoked'],
  Revoked: [],
  Abandoned: [],
};

export function canTransition(from: ConsentState, to: ConsentState): boolean {
  return CONSENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Immutable, versioned consent receipt (append-only). */
export interface ConsentReceipt {
  id: string;
  studentId: string;
  purpose: ConsentPurpose;
  state: ConsentState;
  verifiedAdultUid: string;
  noticeVersion: string;
  policyVersion: string;
  method: string;
  createdAt: number;
}
