// Module E — Official Grade supersession chaining + divergence (pure logic,
// unit-tested). docs/mvp-specification.md §5, §8; invariant 5 (immutability via
// supersession).
//
// An Official Grade is immutable. A correction or a resubmission never mutates
// it — a NEW grade is materialized that points back at the prior via
// `supersedesGradeId` and increments the version. A parent may override the AI
// suggestion; the divergence is computed and retained (§8: parent decides,
// suggested-vs-final always visible to the student).

/** Minimal view of the current Official Grade for an Assignment+Student. */
export interface PriorGradeRef {
  id: string;
  version: number;
  finalScore: number;
}

export interface GradeChain {
  version: number;
  supersedesGradeId: string | null;
}

/** Next version + supersession pointer given the prior grade (null = first). */
export function nextGradeChain(prior: PriorGradeRef | null): GradeChain {
  return {
    version: (prior?.version ?? 0) + 1,
    supersedesGradeId: prior?.id ?? null,
  };
}

export interface Divergence {
  /** True when the parent's final differs from the AI suggestion. */
  overridden: boolean;
  /** final − suggested, or null when there was no suggestion to diverge from. */
  delta: number | null;
}

/** Compare the parent's final score against the AI suggestion (retained). */
export function computeDivergence(suggested: number | null, finalScore: number): Divergence {
  if (suggested === null) return { overridden: false, delta: null };
  return { overridden: suggested !== finalScore, delta: finalScore - suggested };
}

/** Default swing that forces manual review (§8: "large-swing"). */
export const LARGE_SWING_THRESHOLD = 0.25;

/**
 * Whether a new suggestion is a large swing from the prior Official Grade. A
 * first grade (no prior) or a not-assessable suggestion (null) is never a swing.
 */
export function isLargeSwing(
  priorFinal: number | null,
  suggested: number | null,
  threshold: number = LARGE_SWING_THRESHOLD,
): boolean {
  if (priorFinal === null || suggested === null) return false;
  return Math.abs(suggested - priorFinal) >= threshold;
}
