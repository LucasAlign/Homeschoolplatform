// Module J — AI Policy Gateway & Metering: canonical types.
// See docs/mvp-specification.md §12 and issue #13.
//
// Every privileged AI call routes through this module. Consumption is metered
// in normalized per-Student cost-units, classified Essential vs Discretionary.
// A bounded protected reserve keeps Essential work running even at an exhausted
// allowance and a $0 overage ceiling.

export type CostClass = 'essential' | 'discretionary';

/** What an AI operation is for; drives the cost class. */
export type AIPurpose =
  | 'ingestion_ocr'
  | 'ingestion_structuring'
  | 'assessment'
  | 'tutoring'
  | 'scheduling';

/** Operations essential to daily learning are never budget-denied. */
export const ESSENTIAL_PURPOSES: ReadonlySet<AIPurpose> = new Set<AIPurpose>([
  'ingestion_ocr',
  'ingestion_structuring',
  'assessment',
  'tutoring',
  'scheduling',
]);

export function costClassFor(purpose: AIPurpose, extraordinary = false): CostClass {
  // Extraordinary use of an otherwise-essential purpose (bulk re-processing,
  // beyond-threshold tutoring, retries past a bound) is Discretionary.
  if (extraordinary) return 'discretionary';
  return ESSENTIAL_PURPOSES.has(purpose) ? 'essential' : 'discretionary';
}

/** Household allowance/reserve snapshot for a billing period (module I feeds this). */
export interface AllowanceState {
  householdId: string;
  periodStart: number;
  /** Included pooled allowance for the household this period, in cost-units. */
  includedUnits: number;
  /** Cost-units already consumed this period (all students, pooled). */
  usedUnits: number;
  /** Protected Essential reserve floor per Student, in cost-units. */
  reservePerStudentUnits: number;
  /** Reserve already drawn per Student this period. */
  reserveUsedByStudent: Record<string, number>;
  /** Parent-authorized overage ceiling in cost-units (0 = hard cap, default). */
  overageCeilingUnits: number;
  /** Overage already consumed this period. */
  overageUsedUnits: number;
}

export type EnforcementSource = 'allowance' | 'reserve' | 'overage' | 'none';

export interface EnforcementDecision {
  allow: boolean;
  source: EnforcementSource;
  /** Set when a threshold was crossed or the call was denied. */
  reason?:
    | 'within_allowance'
    | 'allowance_exhausted_no_overage'
    | 'overage_ceiling_reached'
    | 'drawn_from_reserve'
    | 'reserve_low_flag_review';
}

export interface AICallRequest {
  uid: string;
  householdId: string;
  /** The record the underlying operation authorizes against (fail-closed). */
  record: import('../identity/roles').RecordType;
  /**
   * Present when the call processes a specific Student's child data (assessment,
   * tutoring): enforces the consent gate and per-Student reserve. Absent for
   * household-level operations such as parent-uploaded curriculum ingestion,
   * which is not child data and is metered against the pooled household reserve.
   */
  studentId?: string;
  purpose: AIPurpose;
  /** Pre-flighted estimate in normalized cost-units. */
  estimatedUnits: number;
  extraordinary?: boolean;
}

/** Reserve bucket key: a Student id, or the household pool for non-student ops. */
export const HOUSEHOLD_RESERVE_KEY = '__household__';

export interface AICallResult<T = unknown> {
  ok: boolean;
  output?: T;
  decision: EnforcementDecision;
  vendor: string;
  model: string;
  feature: string;
  actualUnits: number;
}
