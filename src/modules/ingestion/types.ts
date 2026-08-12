// Module B — Curriculum Ingestion: canonical types.
// See docs/mvp-specification.md §5 (Import lifecycle), §6, and issues #2/#17.

export const MATERIAL_ROLES = ['student', 'answer_key', 'teacher_guide', 'mixed'] as const;
export type MaterialRole = (typeof MATERIAL_ROLES)[number];

/**
 * Adult-only material is isolated at Uploaded and never enters student/tutor/
 * AI-assessment context (invariant 2). `mixed` must be split before student
 * portions are used.
 */
export function isAdultOnly(role: MaterialRole): boolean {
  return role === 'answer_key' || role === 'teacher_guide';
}
export function requiresSplit(role: MaterialRole): boolean {
  return role === 'mixed';
}

export const IMPORT_STATES = [
  'Uploading',
  'Uploaded',
  'Preflight',
  'Queued',
  'Processing',
  'ExtractedDraft',
  'NeedsCorrection',
  'Approved',
  'Failed',
  'Rejected',
] as const;
export type ImportState = (typeof IMPORT_STATES)[number];

export interface Provenance {
  sourcePage: number;
  region?: { x: number; y: number; w: number; h: number };
}

export interface QualityFlag {
  kind: 'blur' | 'glare' | 'cutoff' | 'noise' | 'low_confidence' | 'rotation';
  page: number;
}

export interface ImportJob {
  id: string;
  householdId: string;
  curriculumSourceId: string;
  uploaderUid: string;
  materialRole: MaterialRole;
  state: ImportState;
  rightsAttested: boolean;
  originalHash: string;
  /** Idempotency key for the async worker (at-least-once delivery). */
  idempotencyKey: string;
  qualityFlags: QualityFlag[];
  createdAt: number;
  updatedAt: number;
}

export interface DraftAssignment {
  title: string;
  confidence: number;
  provenance: Provenance;
}
export interface DraftLesson {
  title: string;
  order: number;
  confidence: number;
  assignments: DraftAssignment[];
}

/** Advisory extracted draft — never student-visible until parent Approved. */
export interface ExtractedDraft {
  importId: string;
  courseTitle: string;
  lessons: DraftLesson[];
  overallConfidence: number;
  internallyConsistent: boolean;
  qualityFlags: QualityFlag[];
}
