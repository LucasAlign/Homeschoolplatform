// Module J — the single choke point every privileged AI call passes through.
//
// invokeAI(): authorize (fail-closed) -> consent gate -> evaluate the
// enforcement ladder against the household allowance -> (if allowed) call the
// US-region provider -> meter actual cost-units back onto the allowance ->
// record an audit event with vendor/model/feature/cost (invariant 8/9).

import { adminDb } from '../../lib/firebase/admin';
import { authorize } from '../identity/authorize';
import { assertCollectionAllowed } from '../consent/consent';
import { recordAudit } from '../audit/audit';
import { evaluateEnforcement, reserveKey } from './metering';
import { getProvider } from './providers';
import type { AICallRequest, AICallResult, AllowanceState } from './types';

function allowanceRef(householdId: string) {
  return adminDb.doc(`households/${householdId}/allowance/current`);
}

const EMPTY_ALLOWANCE = (householdId: string): AllowanceState => ({
  householdId,
  periodStart: Date.now(),
  includedUnits: 0,
  usedUnits: 0,
  reservePerStudentUnits: 0,
  reserveUsedByStudent: {},
  overageCeilingUnits: 0,
  overageUsedUnits: 0,
});

export async function invokeAI<T = unknown>(
  req: AICallRequest,
  payload: unknown,
): Promise<AICallResult<T>> {
  // Authorization for the underlying operation (fail-closed).
  await authorize({
    uid: req.uid,
    householdId: req.householdId,
    record: req.record,
    action: 'write',
    studentId: req.studentId,
  });

  // Consent gate: no child-data AI processing without Active consent. Applies
  // only when a specific Student's data is involved (not household-level
  // curriculum ingestion, which is parent material, not child data).
  if (req.studentId) {
    await assertCollectionAllowed(req.householdId, req.studentId);
  }

  const snap = await allowanceRef(req.householdId).get();
  const state = (snap.exists ? (snap.data() as AllowanceState) : EMPTY_ALLOWANCE(req.householdId));

  const decision = evaluateEnforcement(state, req);
  if (!decision.allow) {
    await recordAudit({
      householdId: req.householdId,
      actorUid: req.uid,
      action: 'write',
      recordType: 'ai_call',
      studentId: req.studentId,
      detail: `denied ${req.purpose}: ${decision.reason}`,
    });
    return {
      ok: false,
      decision,
      vendor: '',
      model: '',
      feature: req.purpose,
      actualUnits: 0,
    };
  }

  const res = await getProvider().invoke<T>({ purpose: req.purpose, payload });

  // Meter the actual cost-units back onto the allowance, by source.
  await adminDb.runTransaction(async (tx) => {
    const cur = await tx.get(allowanceRef(req.householdId));
    const s = (cur.exists ? (cur.data() as AllowanceState) : EMPTY_ALLOWANCE(req.householdId));
    const units = res.actualUnits;
    if (decision.source === 'overage') {
      s.overageUsedUnits += units;
    } else if (decision.source === 'reserve') {
      const key = reserveKey(req);
      s.reserveUsedByStudent[key] = (s.reserveUsedByStudent[key] ?? 0) + units;
    } else {
      s.usedUnits += units;
    }
    tx.set(allowanceRef(req.householdId), s);
  });

  await recordAudit({
    householdId: req.householdId,
    actorUid: req.uid,
    action: 'write',
    recordType: 'ai_call',
    studentId: req.studentId,
    detail: `${req.purpose} via ${res.vendor}/${res.model}/${res.feature} units=${res.actualUnits} src=${decision.source}`,
  });

  return {
    ok: true,
    output: res.output,
    decision,
    vendor: res.vendor,
    model: res.model,
    feature: res.feature,
    actualUnits: res.actualUnits,
  };
}
