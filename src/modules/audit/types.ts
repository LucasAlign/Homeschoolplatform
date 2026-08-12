// Module L — Audit & Access Log: canonical immutable audit event.
// See docs/mvp-specification.md §17 (invariant 9) and issue #12.
//
// Append-only. Content-free for administrative actions: records WHO did WHAT
// to WHICH record under WHAT authorization — never the record's content.
// Identifiers are opaque; nothing here is a substitute for the data itself.

export interface AuditEvent {
  id: string;
  /** Opaque actor id (pseudonymous in exported metrics). */
  actorUid: string;
  actorRole?: string;
  action: 'read' | 'write' | 'approve' | 'delete' | 'staff_access';
  recordType: string;
  recordId?: string;
  studentId?: string;
  /** Short, content-free description of the authorization basis / transition. */
  detail?: string;
  /** Staff content access is additionally household-visible (invariant 9). */
  staffAccessCase?: string;
  createdAt: number;
}
