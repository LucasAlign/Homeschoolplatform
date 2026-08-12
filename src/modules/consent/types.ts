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

// ===========================================================================
// Module K (full) — Retention, Deletion & Export. See §14.
// ===========================================================================

// --- Retention tiers (§14) ---
//
// Every data class is bound to a PURPOSE-LIMITED retention tier. Only
// parent-approved snapshots + content-free compliance records persist long-term
// (Tier 3). Exact day-counts are fixed under counsel review (deferred, §21) — the
// tier is the durable, purpose-limited classification, not a hard day-count here.
export const RETENTION_TIERS = [
  'Tier0_Transient', // ephemeral derivatives; deleted on schedule (shortest)
  'Tier1_Operational', // active operational records; deleted when no longer operationally needed
  'Tier2_ActiveAcademic', // records for the active academic period
  'Tier3_Durable', // parent-approved snapshots + content-free compliance records
] as const;
export type RetentionTier = (typeof RETENTION_TIERS)[number];

/**
 * The canonical data classes retention is classified over. Deliberately spans the
 * modules so the mapping is a single source of truth (§14).
 */
export const DATA_CLASSES = [
  // Tier 0 — transient derivatives (deleted on schedule; never durable).
  'upload_derivative',
  'ocr_intermediate',
  'ai_prompt_context',
  'ephemeral_cache',
  'page_window',
  // Tier 1 — active operational records.
  'submission',
  'evidence',
  'support_event',
  'proposed_schedule',
  'notification',
  'review_flag',
  'ai_assessment',
  // Tier 2 — active-academic records.
  'course',
  'plan_revision',
  'official_grade',
  'mastery_record',
  'school_year',
  // Tier 3 — durable: only these persist long-term.
  'approved_snapshot',
  'consent_receipt',
  'audit_event',
  'deletion_ledger',
  'compliance_record',
] as const;
export type DataClass = (typeof DATA_CLASSES)[number];

// --- Deletion (§14) ---
//
// Reversible grace → CASCADING hard delete across every surface → content-free
// deletion ledger → honest ~180-day backup ceiling. A legal hold overrides and
// blocks the cascade.
export const DELETION_SURFACES = [
  'database',
  'storage',
  'search_indexes',
  'embeddings',
  'caches',
  'logs',
  'queues',
  'exports',
  'backups',
  'subprocessors',
] as const;
export type DeletionSurface = (typeof DELETION_SURFACES)[number];

/** How a surface is cleared in the cascade. */
export type DeletionMethod =
  | 'hard_delete' // removed immediately once grace elapses
  | 'purge_on_rotation' // backups: honest ~180-day ceiling, cleared on rotation
  | 'propagate_request' // subprocessors: deletion request propagated under the DPA
  | 'retain_content_free'; // logs/ledger: identifiable content removed, content-free record kept

export interface DeletionSurfaceAction {
  surface: DeletionSurface;
  method: DeletionMethod;
  /** True when the surface is cleared immediately after grace (vs. on a ceiling). */
  immediate: boolean;
  /** Content-free note describing the action for the plan / ledger. */
  note: string;
}

export interface DeletionRequest {
  /** Household-scoped or a single Student within it. */
  scope: 'household' | 'student';
  targetId: string;
  /** A legal hold overrides deletion and blocks the cascade (§14). */
  legalHold: boolean;
  /** Deletion is export-first: a portable export must be offered/completed. */
  exportCompleted: boolean;
}

export interface DeletionPlan {
  scope: 'household' | 'student';
  targetId: string;
  /** Reversible grace before the cascade runs. */
  gracePeriodDays: number;
  surfaces: DeletionSurfaceAction[];
  /** The honest backup ceiling: identifiable data lingers in backups until this. */
  backupCeilingDays: number;
  /** The cascade always writes a content-free deletion ledger entry. */
  writesLedger: true;
  /** Blocked by a legal hold — no surface is cleared. */
  blocked: boolean;
  blockReason: string | null;
}

/**
 * The content-free deletion ledger entry (§14). It records THAT data was deleted
 * and under what basis — never the deleted content. Durable (Tier 3), owner-read.
 */
export interface DeletionLedgerEntry {
  id: string;
  scope: 'household' | 'student';
  targetId: string;
  requestedByUid: string;
  /** Content-free list of surfaces the cascade covered. */
  surfaces: DeletionSurface[];
  backupCeilingDays: number;
  exportCompleted: boolean;
  createdAt: number;
}

// --- Export (§14) ---
//
// Portable, HOUSEHOLD-SCOPED export (JSON/CSV + portfolio PDF) with adult content
// SEPARATED from child academic content. The PDF is a render of the approved
// snapshot (a deferred worker). notify → export → delete on inactivity.
export const EXPORT_BUNDLES = ['child', 'adult'] as const;
export type ExportBundle = (typeof EXPORT_BUNDLES)[number];

/** A candidate item for export, classified for bundle separation + scoping. */
export interface ExportSourceItem {
  id: string;
  dataClass: DataClass;
  /** The Household the item belongs to; cross-household items are excluded. */
  householdId: string;
  studentId?: string;
}

export interface ExportItem {
  id: string;
  dataClass: DataClass;
  bundle: ExportBundle;
  studentId?: string;
}

export interface ExportScope {
  householdId: string;
  child: ExportItem[];
  adult: ExportItem[];
  /** Items excluded from export entirely (cross-household or never-exportable). */
  excluded: { id: string; dataClass: DataClass; reason: string }[];
}

/** The inactivity lifecycle phase for the notify → export → delete flow. */
export type InactivityPhase = 'active' | 'notify' | 'export' | 'delete';

