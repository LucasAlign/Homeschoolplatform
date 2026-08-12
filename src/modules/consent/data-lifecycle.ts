// Module K — Retention / Deletion / Export operations (server-only, Admin SDK).
//
// These are HOUSEHOLD-OWNER-only lifecycle actions (§13): deletion and export are
// Owner authority, fail-closed via authorize(). The pure logic decides WHAT
// (generateDeletionPlan / buildExportScope / retention classification); this file
// gates, persists the content-free deletion ledger, and enqueues the deferred
// worker jobs (cascade execution + portfolio-PDF render are deferred workers).
// Every write is audited (invariant 9).

import { adminDb } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { recordAudit } from '../audit/audit';
import { generateDeletionPlan } from './deletion';
import { buildExportScope } from './export';
import type {
  DeletionLedgerEntry,
  DeletionPlan,
  DeletionRequest,
  ExportScope,
  ExportSourceItem,
} from './types';

export class LifecycleError extends Error {
  constructor(reason: string) {
    super(`data lifecycle: ${reason}`);
    this.name = 'LifecycleError';
  }
}

function ledgerCol(hid: string) {
  return adminDb.collection(`households/${hid}/deletionLedger`);
}

/**
 * Request a cascading deletion — HOUSEHOLD-OWNER-only. Computes the plan purely
 * (grace, surfaces, backup ceiling, legal-hold / export-first blocks). A blocked
 * plan (legal hold or missing export) throws without writing anything. On a valid
 * plan it writes the content-free deletion ledger entry (durable, Tier 3,
 * owner-read) and returns the plan for the deferred cascade worker to execute.
 *
 * The actual cross-surface hard-delete (storage/indexes/embeddings/caches/logs/
 * queues/exports/backups/subprocessors) is a deferred idempotent worker; this
 * records the authorized intent + the content-free ledger that outlives the data.
 */
export async function requestDeletion(args: {
  uid: string;
  householdId: string;
  request: DeletionRequest;
}): Promise<{ plan: DeletionPlan; ledgerEntry: DeletionLedgerEntry }> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'deletion',
    action: 'approve',
  });

  const plan = generateDeletionPlan(args.request);
  if (plan.blocked) {
    throw new LifecycleError(plan.blockReason ?? 'deletion blocked');
  }

  const ref = ledgerCol(args.householdId).doc();
  const ledgerEntry: DeletionLedgerEntry = {
    id: ref.id,
    scope: args.request.scope,
    targetId: args.request.targetId,
    requestedByUid: args.uid,
    // Content-free: only WHICH surfaces, never the deleted content.
    surfaces: plan.surfaces.map((s) => s.surface),
    backupCeilingDays: plan.backupCeilingDays,
    exportCompleted: args.request.exportCompleted,
    createdAt: Date.now(),
  };
  await ref.create(ledgerEntry); // append-only, immutable ledger

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'delete',
    recordType: 'deletion',
    recordId: ref.id,
    studentId: args.request.scope === 'student' ? args.request.targetId : undefined,
    detail: `deletion requested scope=${args.request.scope} surfaces=${ledgerEntry.surfaces.length} backupCeiling=${plan.backupCeilingDays}d`,
  });

  return { plan, ledgerEntry };
}

/**
 * Request a portable, household-scoped export — HOUSEHOLD-OWNER-only. Builds the
 * export scope purely (child vs. adult bundle separation, cross-household
 * exclusion). The JSON/CSV serialization + portfolio-PDF render are a deferred
 * worker; this returns the authorized scope and audits the request.
 */
export async function requestExport(args: {
  uid: string;
  householdId: string;
  items: ExportSourceItem[];
}): Promise<ExportScope> {
  await authorize({
    uid: args.uid,
    householdId: args.householdId,
    record: 'export',
    action: 'approve',
  });

  const scope = buildExportScope(args.householdId, args.items);

  await recordAudit({
    householdId: args.householdId,
    actorUid: args.uid,
    action: 'read',
    recordType: 'export',
    detail: `export requested child=${scope.child.length} adult=${scope.adult.length} excluded=${scope.excluded.length}`,
  });

  return scope;
}
