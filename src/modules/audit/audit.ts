// Module L — append-only audit writer (server-only, Admin SDK).
//
// Firestore rules deny all client writes to /audit; only the server writes
// here, and it never updates or deletes an event (immutability). Owners can
// read their household's audit trail (household-visible), enforced by rules.

import { adminDb } from '../../lib/firebase/admin';
import type { AuditEvent } from './types';

export interface RecordAuditInput extends Omit<AuditEvent, 'id' | 'createdAt'> {
  /** Household the event is scoped under (path only; not stored on the event). */
  householdId: string;
}

export async function recordAudit(input: RecordAuditInput): Promise<AuditEvent> {
  const { householdId, ...eventFields } = input;
  const ref = adminDb.collection(`households/${householdId}/audit`).doc();
  const event: AuditEvent = { ...eventFields, id: ref.id, createdAt: Date.now() };
  await ref.create(event); // create() throws rather than overwrite — immutability
  return event;
}
