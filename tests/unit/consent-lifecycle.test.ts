import { describe, expect, it } from 'vitest';
import {
  classifyRetention,
  persistsLongTerm,
  dataClassesInTier,
  RETENTION_MAP,
} from '../../src/modules/consent/retention';
import {
  generateDeletionPlan,
  cascadeSurfaces,
  resolveImmutableRecordMutation,
  BACKUP_CEILING_DAYS,
  DEFAULT_GRACE_PERIOD_DAYS,
} from '../../src/modules/consent/deletion';
import {
  buildExportScope,
  resolveInactivityPhase,
} from '../../src/modules/consent/export';
import {
  DATA_CLASSES,
  DELETION_SURFACES,
  type DataClass,
  type DeletionRequest,
  type ExportSourceItem,
} from '../../src/modules/consent/types';

const delRequest = (over: Partial<DeletionRequest> = {}): DeletionRequest => ({
  scope: 'household',
  targetId: 'h1',
  legalHold: false,
  exportCompleted: true,
  ...over,
});

// --- Retention-tier classification (§14) ---
describe('retention-tier classification', () => {
  it('maps every data class to exactly one tier (total map)', () => {
    for (const dc of DATA_CLASSES) {
      expect(RETENTION_MAP[dc]).toBeDefined();
    }
    expect(Object.keys(RETENTION_MAP)).toHaveLength(DATA_CLASSES.length);
  });

  it('classes transient derivatives as Tier 0', () => {
    expect(classifyRetention('upload_derivative')).toBe('Tier0_Transient');
    expect(classifyRetention('ai_prompt_context')).toBe('Tier0_Transient');
  });

  it('persists ONLY approved snapshots + content-free compliance records long-term', () => {
    const durable: DataClass[] = [
      'approved_snapshot',
      'consent_receipt',
      'audit_event',
      'deletion_ledger',
      'compliance_record',
    ];
    for (const dc of durable) expect(persistsLongTerm(dc)).toBe(true);

    // Nothing operational or academic is durable.
    for (const dc of ['submission', 'evidence', 'official_grade', 'course', 'ai_assessment'] as DataClass[]) {
      expect(persistsLongTerm(dc)).toBe(false);
    }
    // The full durable set is exactly Tier 3.
    expect(new Set(dataClassesInTier('Tier3_Durable'))).toEqual(new Set(durable));
  });
});

// --- Deletion-cascade plan generation (§14) ---
describe('deletion-cascade plan generation', () => {
  it('covers every deletion surface with the ledger + honest backup ceiling', () => {
    const plan = generateDeletionPlan(delRequest());
    expect(plan.blocked).toBe(false);
    expect(plan.surfaces.map((s) => s.surface).sort()).toEqual([...DELETION_SURFACES].sort());
    expect(plan.surfaces).toHaveLength(cascadeSurfaces().length);
    expect(plan.writesLedger).toBe(true);
    expect(plan.backupCeilingDays).toBe(BACKUP_CEILING_DAYS);
    expect(plan.gracePeriodDays).toBe(DEFAULT_GRACE_PERIOD_DAYS);
  });

  it('clears live surfaces immediately but purges backups only on rotation', () => {
    const plan = generateDeletionPlan(delRequest());
    const backups = plan.surfaces.find((s) => s.surface === 'backups')!;
    expect(backups.method).toBe('purge_on_rotation');
    expect(backups.immediate).toBe(false);

    const db = plan.surfaces.find((s) => s.surface === 'database')!;
    expect(db.method).toBe('hard_delete');
    expect(db.immediate).toBe(true);

    const subs = plan.surfaces.find((s) => s.surface === 'subprocessors')!;
    expect(subs.method).toBe('propagate_request');

    const logs = plan.surfaces.find((s) => s.surface === 'logs')!;
    expect(logs.method).toBe('retain_content_free');
  });

  it('a legal hold overrides deletion and blocks the cascade', () => {
    const plan = generateDeletionPlan(delRequest({ legalHold: true }));
    expect(plan.blocked).toBe(true);
    expect(plan.surfaces).toEqual([]);
    expect(plan.blockReason).toMatch(/legal hold/);
  });

  it('is export-first: blocks when no export was completed', () => {
    const plan = generateDeletionPlan(delRequest({ exportCompleted: false }));
    expect(plan.blocked).toBe(true);
    expect(plan.blockReason).toMatch(/export-first/);
  });
});

// --- Immutability vs. deletion rule (§14, invariant 5) ---
describe('immutability-vs-deletion rule', () => {
  it('always rejects an edit of an immutable record', () => {
    expect(resolveImmutableRecordMutation('edit', { authorized: true, exportCompleted: true }).allowed).toBe(false);
  });

  it('permits a whole-delete only when authorized AND export-first', () => {
    expect(resolveImmutableRecordMutation('delete', { authorized: true, exportCompleted: true }).allowed).toBe(true);
    expect(resolveImmutableRecordMutation('delete', { authorized: false, exportCompleted: true }).allowed).toBe(false);
    expect(resolveImmutableRecordMutation('delete', { authorized: true, exportCompleted: false }).allowed).toBe(false);
  });
});

// --- Export scope filtering + adult-content separation (§14, invariants 1,2) ---
describe('export scope filtering + adult-content separation', () => {
  const items: ExportSourceItem[] = [
    { id: 'g1', dataClass: 'official_grade', householdId: 'h1', studentId: 's1' },
    { id: 'ev1', dataClass: 'evidence', householdId: 'h1', studentId: 's1' },
    { id: 'snap1', dataClass: 'approved_snapshot', householdId: 'h1', studentId: 's1' },
    { id: 'c1', dataClass: 'consent_receipt', householdId: 'h1' },
    { id: 'au1', dataClass: 'audit_event', householdId: 'h1' },
  ];

  it('separates child academic content from adult administrative content', () => {
    const scope = buildExportScope('h1', items);
    expect(scope.child.map((i) => i.id).sort()).toEqual(['ev1', 'g1', 'snap1']);
    expect(scope.adult.map((i) => i.id).sort()).toEqual(['au1', 'c1']);
    expect(scope.child.every((i) => i.bundle === 'child')).toBe(true);
    expect(scope.adult.every((i) => i.bundle === 'adult')).toBe(true);
  });

  it('excludes cross-household items (invariant 1)', () => {
    const scope = buildExportScope('h1', [
      ...items,
      { id: 'foreign', dataClass: 'official_grade', householdId: 'OTHER', studentId: 'x' },
    ]);
    expect(scope.child.find((i) => i.id === 'foreign')).toBeUndefined();
    expect(scope.excluded.find((i) => i.id === 'foreign')?.reason).toMatch(/cross-household/);
  });

  it('never exports transient derivatives', () => {
    const scope = buildExportScope('h1', [
      { id: 'tmp', dataClass: 'ocr_intermediate', householdId: 'h1' },
    ]);
    expect(scope.child).toEqual([]);
    expect(scope.adult).toEqual([]);
    expect(scope.excluded[0].reason).toMatch(/transient/);
  });
});

// --- notify → export → delete inactivity lifecycle (§14) ---
describe('inactivity lifecycle phase', () => {
  const thresholds = { notifyAfterDays: 90, exportAfterDays: 120, deleteAfterDays: 180 };

  it('walks active → notify → export → delete as inactivity grows', () => {
    expect(resolveInactivityPhase(0, thresholds)).toBe('active');
    expect(resolveInactivityPhase(90, thresholds)).toBe('notify');
    expect(resolveInactivityPhase(120, thresholds)).toBe('export');
    expect(resolveInactivityPhase(180, thresholds)).toBe('delete');
    expect(resolveInactivityPhase(365, thresholds)).toBe('delete');
  });
});
