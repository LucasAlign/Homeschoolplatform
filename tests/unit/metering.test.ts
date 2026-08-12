import { describe, expect, it } from 'vitest';
import { evaluateEnforcement, reserveRemaining } from '../../src/modules/ai-gateway/metering';
import type { AICallRequest, AllowanceState } from '../../src/modules/ai-gateway/types';

function state(over: Partial<AllowanceState> = {}): AllowanceState {
  return {
    householdId: 'h',
    periodStart: 0,
    includedUnits: 100,
    usedUnits: 0,
    reservePerStudentUnits: 20,
    reserveUsedByStudent: {},
    overageCeilingUnits: 0,
    overageUsedUnits: 0,
    ...over,
  };
}

function req(over: Partial<AICallRequest> = {}): AICallRequest {
  return {
    uid: 'u',
    householdId: 'h',
    record: 'assessment' as never, // record type not exercised by pure metering
    studentId: 's1',
    purpose: 'assessment',
    estimatedUnits: 10,
    ...over,
  };
}

describe('enforcement ladder', () => {
  it('allows from allowance when there is headroom', () => {
    const d = evaluateEnforcement(state(), req({ estimatedUnits: 10 }));
    expect(d).toMatchObject({ allow: true, source: 'allowance' });
  });

  it('essential draws from the reserve when allowance is exhausted', () => {
    const d = evaluateEnforcement(state({ usedUnits: 100 }), req({ purpose: 'assessment', estimatedUnits: 10 }));
    expect(d).toMatchObject({ allow: true, source: 'reserve', reason: 'drawn_from_reserve' });
  });

  it('essential is NEVER budget-denied — depleted reserve still allows, flagged', () => {
    const d = evaluateEnforcement(
      state({ usedUnits: 100, reserveUsedByStudent: { s1: 20 } }),
      req({ purpose: 'tutoring', estimatedUnits: 5 }),
    );
    expect(d.allow).toBe(true);
    expect(d.reason).toBe('reserve_low_flag_review');
  });

  it('discretionary is denied when allowance exhausted and no overage authorized', () => {
    const d = evaluateEnforcement(
      state({ usedUnits: 100 }),
      req({ extraordinary: true, estimatedUnits: 5 }),
    );
    expect(d).toMatchObject({ allow: false, source: 'none', reason: 'allowance_exhausted_no_overage' });
  });

  it('discretionary uses authorized overage up to the ceiling', () => {
    const withOverage = state({ usedUnits: 100, overageCeilingUnits: 50, overageUsedUnits: 0 });
    expect(evaluateEnforcement(withOverage, req({ extraordinary: true, estimatedUnits: 30 })))
      .toMatchObject({ allow: true, source: 'overage' });
    expect(evaluateEnforcement(withOverage, req({ extraordinary: true, estimatedUnits: 60 })))
      .toMatchObject({ allow: false, reason: 'overage_ceiling_reached' });
  });

  it('household-level (no studentId) essential draws the pooled reserve', () => {
    const d = evaluateEnforcement(
      state({ usedUnits: 100 }),
      req({ studentId: undefined, purpose: 'ingestion_ocr', estimatedUnits: 5 }),
    );
    expect(d).toMatchObject({ allow: true, source: 'reserve' });
  });

  it('reserveRemaining floors at zero', () => {
    expect(reserveRemaining(state({ reserveUsedByStudent: { s1: 25 } }), 's1')).toBe(0);
  });
});
