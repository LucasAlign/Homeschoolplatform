// Module C — Planning & Scheduling: canonical types.
// See docs/mvp-specification.md §5 (Planning) and issue #6.

/** Planning scope: one Student's plan within a School Year. */
export interface PlanScope {
  studentId: string;
  schoolYearId: string;
}

/** A placed unit of work. `date` is an ISO calendar day (YYYY-MM-DD). */
export interface ScheduledAssignment {
  assignmentId: string;
  courseId: string;
  date: string;
  /** Order within the day (Students may reorder same-day when policy permits). */
  order: number;
  /** Position in the curriculum sequence; reflow must preserve relative order. */
  sequenceIndex: number;
  /** A fixed-date item: never moved by Student action or auto-reflow. */
  fixed: boolean;
  /** Whether this item may be deferred at all. */
  deferrable: boolean;
  /** Workload contribution toward the daily cap. */
  workloadUnits: number;
}

/**
 * Advisory placement. `full` replaces the schedule; `change_set` proposes edits.
 * `basedOnRevisionId` is the revision it was computed against — used for
 * optimistic concurrency at approval.
 */
export interface ProposedSchedule {
  id: string;
  scope: PlanScope;
  kind: 'full' | 'change_set';
  placements: ScheduledAssignment[];
  basedOnRevisionId: string | null;
  advisory: true;
  createdAt: number;
}

/** Immutable, effective-dated Plan Revision (append-only, supersession chain). */
export interface PlanRevision {
  id: string;
  scope: PlanScope;
  revisionNumber: number;
  effectiveDate: string;
  placements: ScheduledAssignment[];
  supersedesRevisionId: string | null;
  approvedByUid: string;
  createdAt: number;
}

/** Pointer to the current revision for a scope. */
export interface ApprovedPlan {
  scope: PlanScope;
  currentRevisionId: string;
  currentRevisionNumber: number;
  updatedAt: number;
}

export interface DeferralPolicy {
  allowReorderSameDay: boolean;
  /** Max days an Assignment may be deferred from its scheduled date. */
  maxDeferralDays: number;
  /** Daily workload cap the schedule and reflow must respect. */
  dailyWorkloadCap: number;
  /** When true, bounded reflow within the same week may auto-apply (issue #6). */
  autoReflowWithinWeek: boolean;
}

/** Household default + per-Student + per-Course overrides (most specific wins). */
export interface DeferralPolicyConfig {
  household: DeferralPolicy;
  perStudent: Record<string, Partial<DeferralPolicy>>;
  perCourse: Record<string, Partial<DeferralPolicy>>;
}
