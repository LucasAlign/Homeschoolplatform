// Module K — retention-tier classification (pure logic, unit-tested).
// docs/mvp-specification.md §14, §17 (invariant on purpose-limited retention).
//
// Every data class maps to exactly one purpose-limited retention tier. The
// promise (§14): only parent-approved snapshots + content-free compliance records
// persist long-term (Tier 3). Everything else — transient derivatives, active
// operational records, active-academic records — is purpose-limited and purges
// earlier. Exact day-counts are fixed under counsel review (deferred, §21); the
// TIER is the durable classification this module owns, not the day-count.

import { type DataClass, type RetentionTier } from './types';

/**
 * The single source of truth mapping each data class to its retention tier.
 * Adding a data class WITHOUT a tier here is a type error (Record is total), so
 * nothing silently defaults into long-term retention.
 */
export const RETENTION_MAP: Record<DataClass, RetentionTier> = {
  // Tier 0 — transient derivatives, deleted on schedule (§6: "delete transient
  // derivatives on schedule"). Never durable, never in an export.
  upload_derivative: 'Tier0_Transient',
  ocr_intermediate: 'Tier0_Transient',
  ai_prompt_context: 'Tier0_Transient',
  ephemeral_cache: 'Tier0_Transient',
  page_window: 'Tier0_Transient',

  // Tier 1 — active operational records: needed while the daily loop runs.
  submission: 'Tier1_Operational',
  evidence: 'Tier1_Operational',
  support_event: 'Tier1_Operational',
  proposed_schedule: 'Tier1_Operational',
  notification: 'Tier1_Operational',
  review_flag: 'Tier1_Operational',
  ai_assessment: 'Tier1_Operational',

  // Tier 2 — active-academic records for the reporting period.
  course: 'Tier2_ActiveAcademic',
  plan_revision: 'Tier2_ActiveAcademic',
  official_grade: 'Tier2_ActiveAcademic',
  mastery_record: 'Tier2_ActiveAcademic',
  school_year: 'Tier2_ActiveAcademic',

  // Tier 3 — DURABLE. Only parent-approved snapshots + content-free compliance
  // records persist long-term (§14).
  approved_snapshot: 'Tier3_Durable',
  consent_receipt: 'Tier3_Durable',
  audit_event: 'Tier3_Durable',
  deletion_ledger: 'Tier3_Durable',
  compliance_record: 'Tier3_Durable',
};

/** Classify a data class into its purpose-limited retention tier. */
export function classifyRetention(dataClass: DataClass): RetentionTier {
  return RETENTION_MAP[dataClass];
}

/**
 * Whether a data class persists long-term. TRUE for Tier 3 ONLY — the durable
 * classification is reserved for parent-approved snapshots + content-free
 * compliance records; every other class is purpose-limited (§14).
 */
export function persistsLongTerm(dataClass: DataClass): boolean {
  return classifyRetention(dataClass) === 'Tier3_Durable';
}

/** All data classes that fall in a given tier (for retention sweeps / audits). */
export function dataClassesInTier(tier: RetentionTier): DataClass[] {
  return (Object.keys(RETENTION_MAP) as DataClass[]).filter(
    (dc) => RETENTION_MAP[dc] === tier,
  );
}
