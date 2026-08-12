// Module D — Evidence Policy satisfaction (pure logic, unit-tested).
//
// `submitWork` calls this to decide whether a Submission's attached Evidence
// meets the Assignment's Evidence Policy (§8). Off-policy kinds never count;
// `none` is a valid policy for observation-only work.

import type { Check } from './tutor-logic';
import type { Evidence, EvidencePolicy } from './types';

/** Whether the attached Evidence satisfies the Assignment's Evidence Policy. */
export function evidenceSatisfies(policy: EvidencePolicy, evidence: Evidence[]): Check {
  // `none` policy with no minimum: observation-only work needs no artifact.
  const accept = new Set(policy.acceptedKinds);

  if (policy.adultVerificationRequired && !evidence.some((e) => e.kind === 'adult_verification')) {
    return { ok: false, reason: 'adult verification required' };
  }

  const counted = evidence.filter((e) => accept.has(e.kind));
  if (counted.length < policy.minItems) {
    return {
      ok: false,
      reason: `evidence policy requires at least ${policy.minItems} accepted item(s)`,
    };
  }

  return { ok: true };
}
