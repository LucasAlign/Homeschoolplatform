// Module — Pilot Readiness & Launch (Phase 8, cross-cutting): canonical types.
// See docs/mvp-specification.md §18 (pilot instrumentation & acceptance
// scorecard), §15 (child-privacy telemetry constraints), §5 (efficiency gates),
// §17 (invariants) and issues #18, #5.
//
// The four-week pilot is measured ONLY from metadata and adult-reported signals
// captured at the #14 approval seams — never Student content or PII. Telemetry
// follows the SAME content-free ethos as the audit log (module L): it records
// WHAT happened, WHEN, HOW MANY, HOW MUCH it cost, and the OUTCOME — never the
// record's content. The `TelemetryEvent` shape below is closed by construction:
// every field is a primitive metadatum, and there is no field a caller could use
// to smuggle Student work, PII, evidence/submission bodies, answer-key material,
// or raw AI prompts/outputs. `telemetry-validation.ts` enforces that at runtime.

// --- Metric families (map to the §5 / §18 gates) ---
//
// efficiency ........ setup / approval / daily-review timings (§5)
// ingestion ......... import→OCR→extract reliability (§6/§17 benchmark)
// ai_acceptance ..... accept vs edit / override at the approval seams (§8)
// independence ...... unaided-work signal (§8/§9)
// cost .............. per-Student cost-units from module J metering (§12)
// safety ............ sev-1 event counts (privacy/authz/answer-key/…)
// portfolio ......... adult-reported portfolio usefulness (§11)
export type MetricFamily =
  | 'efficiency'
  | 'ingestion'
  | 'ai_acceptance'
  | 'independence'
  | 'cost'
  | 'safety'
  | 'portfolio';

// The #14 approval seams (and adult-reported surfaces) telemetry reads at. The
// operation names WHAT happened; it never carries the thing that happened to.
export type TelemetryOperation =
  | 'household_setup' // first Household + Student provisioning (efficiency)
  | 'ingestion_approve' // parent approves an extracted Course draft (seam)
  | 'plan_approve' // parent approves a Plan Revision (seam)
  | 'grade_approve' // parent approves an Official Grade (seam)
  | 'mastery_approve' // parent confirms a Mastery level (seam)
  | 'flag_resolve' // adult resolves a Review Flag (seam)
  | 'daily_review' // parent's normal daily review pass (efficiency)
  | 'ingestion_run' // an import pipeline run (reliability)
  | 'ai_call' // a metered gateway-J call (cost)
  | 'independent_work' // a Student submission completed unaided (independence)
  | 'safety_event' // a sev-1 incident was recorded (safety)
  | 'portfolio_report'; // adult-reported portfolio usefulness (portfolio)

// How an adult acted at an approval seam — the AI-acceptance signal. Accepting a
// draft as-is vs editing/overriding/rejecting it is the whole measure; the edited
// content itself is NEVER captured.
export type ApprovalOutcome = 'accepted' | 'edited' | 'overridden' | 'rejected';

// A generic outcome for non-approval operations (a pipeline run, an AI call).
export type OperationOutcome = 'success' | 'partial' | 'failure';

// Severity-1 defect categories that gate the launch (non-waivable, §18).
export type Sev1Category =
  | 'privacy'
  | 'authorization'
  | 'answer_key'
  | 'data_loss'
  | 'billing'
  | 'child_safety';

/**
 * A single pilot telemetry datum. Metadata-only BY CONSTRUCTION:
 *
 * - `householdRef` / `studentRef` are PSEUDONYMOUS opaque ids (a per-pilot
 *   salted hash, not the real Household/Student id and not a name/email).
 * - the numeric fields are timings, counts, and normalized cost-units only.
 * - there is deliberately NO field for content, text, a body, an answer, a
 *   prompt, an AI output, a title, a name, or any free-form string beyond the
 *   closed enums above.
 *
 * Adding a content-bearing field here is a spec violation (§15/§18); the runtime
 * validator additionally rejects any unknown or content-suggestive key so the
 * type and the guard fail closed together.
 */
export interface TelemetryEvent {
  /** Server-assigned opaque event id. */
  id: string;
  /** Pseudonymous household id (salted hash; never the real id/name/email). */
  householdRef: string;
  /** Pseudonymous student id, when the datum is per-Student (else omitted). */
  studentRef?: string;
  family: MetricFamily;
  operation: TelemetryOperation;
  /** Approval-seam outcome (ai_acceptance family). */
  approvalOutcome?: ApprovalOutcome;
  /** Generic outcome (ingestion / ai_call families). */
  operationOutcome?: OperationOutcome;
  /** Active wall-clock the adult spent, in whole milliseconds (efficiency). */
  durationMs?: number;
  /** A dimensionless count (items reviewed, pages OCR'd, interactions). */
  count?: number;
  /** Normalized cost-units from module J metering (cost family). */
  costUnits?: number;
  /** Sev-1 category, present only on a `safety_event`. */
  sev1Category?: Sev1Category;
  /** Whether a recorded sev-1 event is still unresolved (gates launch). */
  sev1Unresolved?: boolean;
  /** Adult-reported usefulness on a fixed 1–5 ordinal (portfolio family). */
  usefulnessScore?: number;
  /** Server capture time (epoch ms). */
  at: number;
}

// The EXHAUSTIVE set of keys a TelemetryEvent may carry. The validator treats any
// other key as a leak and rejects it — this is the runtime half of the
// "content can never enter telemetry" guarantee.
export const ALLOWED_TELEMETRY_KEYS: ReadonlySet<string> = new Set([
  'id',
  'householdRef',
  'studentRef',
  'family',
  'operation',
  'approvalOutcome',
  'operationOutcome',
  'durationMs',
  'count',
  'costUnits',
  'sev1Category',
  'sev1Unresolved',
  'usefulnessScore',
  'at',
]);

// Substrings that, appearing in any key, signal a content/PII field slipped in.
// Belt-and-suspenders alongside the allowlist: a rename of a content field to
// something not in the allowlist is still caught if it reads as content/PII.
export const DISALLOWED_KEY_SUBSTRINGS: readonly string[] = [
  'content',
  'body',
  'text',
  'answer',
  'prompt',
  'response',
  'output',
  'name',
  'email',
  'phone',
  'address',
  'pii',
  'note',
  'comment',
  'transcript',
  'title',
  'evidence',
  'submission',
  'raw',
];

// --- Aggregated metrics ---

/** A per-family aggregate rolled up from many events (for the scorecard). */
export interface MetricAggregate {
  family: MetricFamily;
  /** Number of events that fed this aggregate. */
  sampleCount: number;
  /** Mean active duration in ms (efficiency), when applicable. */
  meanDurationMs?: number;
  /** Acceptance rate = accepted / (accepted+edited+overridden+rejected). */
  acceptanceRate?: number;
  /** Success rate = success / total (ingestion reliability). */
  successRate?: number;
  /** Independence rate = independent completions / total submissions. */
  independenceRate?: number;
  /** Mean normalized cost-units per Student (cost). */
  meanCostUnitsPerStudent?: number;
  /** Mean adult-reported usefulness 1–5 (portfolio). */
  meanUsefulness?: number;
  /** Count of unresolved sev-1 events (safety); MUST be 0 to launch. */
  unresolvedSev1Count?: number;
}

// --- Go / no-go scorecard ---

export type LaunchDecision = 'GO' | 'NO_GO';

/**
 * The non-waivable HARD gates (§18). Any single failure ⇒ NO-GO. No documented
 * exception may waive these — they are the safety/privacy/authorization/
 * integrity/answer-key/parental-authority floor.
 */
export interface HardGateInputs {
  householdsEnrolled: number;
  activeWeeks: number;
  /** Unresolved sev-1 defects, by category. All MUST be zero. */
  unresolvedSev1: Record<Sev1Category, number>;
  /** Independent verifications that each control actually holds. */
  isolationVerified: boolean;
  consentVerified: boolean;
  answerKeyIsolationVerified: boolean;
  deletionExportVerified: boolean;
  /** Per-Student cost is within the funding model, with working caps. */
  perStudentCostWithinModel: boolean;
}

/** A named target metric with its threshold and observed value. */
export interface TargetMetric {
  key: string;
  family: MetricFamily;
  /** Human-readable threshold description (exact numbers fixed pre-pilot, §21). */
  thresholdDescription: string;
  /** Observed value and the threshold, in the metric's own units. */
  observed: number;
  threshold: number;
  /** true when higher-is-better (acceptance); false when lower-is-better (time). */
  higherIsBetter: boolean;
}

/**
 * A documented, evidence-backed exception for a MISSED target metric, with a
 * corrective plan (§18). Valid only for target metrics — never a hard gate.
 */
export interface DocumentedException {
  metricKey: string;
  /** Content-free reference to the evidence (an issue id / ledger ref). */
  evidenceRef: string;
  correctivePlan: string;
  /** The founder Household Owner is the launch decision-maker (§18). */
  approvedByOwnerUid: string;
}

export interface ScorecardInput {
  hardGates: HardGateInputs;
  targets: TargetMetric[];
  exceptions?: DocumentedException[];
}

/** A single evaluated line in the scorecard result. */
export interface ScorecardLine {
  key: string;
  kind: 'hard_gate' | 'target';
  passed: boolean;
  /** For a missed target: whether a valid documented exception covers it. */
  waivedByException?: boolean;
  detail: string;
}

export interface Scorecard {
  decision: LaunchDecision;
  lines: ScorecardLine[];
  /** Reasons the decision is NO-GO (empty on GO). */
  blockingReasons: string[];
  evaluatedAt: number;
}

/** The launch-gate minimums (§18). Exact target percentages are fixed pre-pilot. */
export const MIN_PILOT_HOUSEHOLDS = 10;
export const MIN_ACTIVE_WEEKS = 4;

/** The sev-1 categories whose gate can NEVER be waived (§18). */
export const SEV1_CATEGORIES: readonly Sev1Category[] = [
  'privacy',
  'authorization',
  'answer_key',
  'data_loss',
  'billing',
  'child_safety',
];
