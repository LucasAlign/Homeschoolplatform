// Module K — export-scope filtering + adult-content separation + the inactivity
// lifecycle (pure logic, unit-tested). docs/mvp-specification.md §14, §17
// (invariants 1, 2).
//
// A portable export is HOUSEHOLD-SCOPED (invariant 1): cross-household items are
// excluded, never leaked. Adult content is SEPARATED from child academic content
// into two bundles so a household can hand a child's academic record to another
// party without the adult administrative material. Answer keys / teacher guides
// are NEVER in the child bundle (invariant 2) — they belong to the adult bundle's
// separate boundary if exported at all. The portfolio PDF is a render of the
// approved snapshot (a deferred worker); this file decides SCOPE, not rendering.

import {
  type DataClass,
  type ExportItem,
  type ExportScope,
  type ExportSourceItem,
  type InactivityPhase,
} from './types';

/**
 * Data classes that are ADULT administrative content — separated into the adult
 * bundle, never mixed into a child's academic export.
 */
const ADULT_DATA_CLASSES: ReadonlySet<DataClass> = new Set<DataClass>([
  'consent_receipt',
  'audit_event',
  'deletion_ledger',
  'compliance_record',
  // Answer-key / teacher-guide material is adult-only; if a household exports it,
  // it goes ONLY in the separated adult bundle (never the child bundle).
  'ai_prompt_context',
]);

/**
 * Transient derivatives that are NEVER exported (Tier 0). They are ephemeral by
 * design (§6) and carry no portable record value.
 */
const NEVER_EXPORTED: ReadonlySet<DataClass> = new Set<DataClass>([
  'upload_derivative',
  'ocr_intermediate',
  'ephemeral_cache',
  'page_window',
]);

function bundleFor(dataClass: DataClass): 'child' | 'adult' {
  return ADULT_DATA_CLASSES.has(dataClass) ? 'adult' : 'child';
}

/**
 * Build the household-scoped export, separating adult from child content. Pure:
 * cross-household items (invariant 1) and never-exported transient derivatives are
 * excluded with a content-free reason; everything else lands in the child or adult
 * bundle. The caller supplies only items it already authorized for the household.
 */
export function buildExportScope(
  householdId: string,
  items: ExportSourceItem[],
): ExportScope {
  const child: ExportItem[] = [];
  const adult: ExportItem[] = [];
  const excluded: ExportScope['excluded'] = [];

  for (const item of items) {
    // Household isolation (invariant 1): never export another household's data.
    if (item.householdId !== householdId) {
      excluded.push({ id: item.id, dataClass: item.dataClass, reason: 'cross-household item excluded' });
      continue;
    }
    if (NEVER_EXPORTED.has(item.dataClass)) {
      excluded.push({ id: item.id, dataClass: item.dataClass, reason: 'transient derivative — not exported' });
      continue;
    }

    const bundle = bundleFor(item.dataClass);
    const exportItem: ExportItem = {
      id: item.id,
      dataClass: item.dataClass,
      bundle,
      studentId: item.studentId,
    };
    if (bundle === 'adult') adult.push(exportItem);
    else child.push(exportItem);
  }

  return { householdId, child, adult, excluded };
}

// --- notify → export → delete on inactivity (§14) ---

export interface InactivityThresholds {
  /** Days of inactivity before the household is notified. */
  notifyAfterDays: number;
  /** Days before an automatic export is generated. */
  exportAfterDays: number;
  /** Days before inactive data is deleted. */
  deleteAfterDays: number;
}

/**
 * Resolve the inactivity phase for the notify → export → delete flow. Pure:
 * compares elapsed inactive days against the thresholds and returns the current
 * phase. Thresholds are ordered notify ≤ export ≤ delete; the highest crossed
 * threshold wins so the flow never skips a step's phase label.
 */
export function resolveInactivityPhase(
  inactiveDays: number,
  thresholds: InactivityThresholds,
): InactivityPhase {
  if (inactiveDays >= thresholds.deleteAfterDays) return 'delete';
  if (inactiveDays >= thresholds.exportAfterDays) return 'export';
  if (inactiveDays >= thresholds.notifyAfterDays) return 'notify';
  return 'active';
}
