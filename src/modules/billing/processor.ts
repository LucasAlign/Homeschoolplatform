// Module I — payment-processor interface + a stub. The REAL processor (Stripe
// etc.) implements PaymentProcessor and is wired with credentials during a later
// integration pass — exactly like the AI provider stub (ai-gateway/providers.ts).
//
// NON-NEGOTIABLE: no card / bank / account number, CVV, or any financial
// credential is handled here or anywhere in module I. The interface deals only in
// OPAQUE processor references (a customer handle, a subscription handle) that the
// hosted, PCI-scoped processor issues; the household enters payment details
// directly with the processor, never through this platform. The stub performs NO
// real charge and must never be used in a pilot or production build.

/** An opaque handle the processor issues for a household's billing customer. */
export interface ProcessorCustomerRef {
  ref: string;
}

/** An opaque handle the processor issues for an active subscription. */
export interface ProcessorSubscriptionRef {
  ref: string;
  status: string;
}

export interface CreateSubscriptionCommand {
  /** Opaque household id — never PII, never a payment credential. */
  householdId: string;
  /** Billable active-Student count for the plan. */
  activeStudentCount: number;
  /** Annual school-year amount to bill, in integer cents. */
  annualTotalCents: number;
}

export interface PaymentProcessor {
  readonly name: string;
  /**
   * Establish a subscription with the processor. Receives NO payment credential —
   * the household supplies card/bank details to the hosted processor directly and
   * this call only references the resulting opaque customer handle.
   */
  createSubscription(
    customer: ProcessorCustomerRef,
    command: CreateSubscriptionCommand,
  ): Promise<ProcessorSubscriptionRef>;
  /** Report metered overage usage for billing. Cost-units only, no credentials. */
  reportOverageUsage(
    subscription: ProcessorSubscriptionRef,
    overageUnits: number,
  ): Promise<void>;
}

/**
 * Placeholder processor so billing is wireable before a real processor exists.
 * It performs NO real payment work and handles NO credentials — it only echoes
 * opaque references. Never use in a pilot or production build.
 */
export class StubProcessor implements PaymentProcessor {
  readonly name = 'stub';

  async createSubscription(
    customer: ProcessorCustomerRef,
    command: CreateSubscriptionCommand,
  ): Promise<ProcessorSubscriptionRef> {
    return { ref: `stub-sub-${customer.ref}-${command.activeStudentCount}`, status: 'active' };
  }

  async reportOverageUsage(): Promise<void> {
    // No-op stub: a real processor meters overage for the next invoice.
  }
}

let active: PaymentProcessor = new StubProcessor();

export function getProcessor(): PaymentProcessor {
  return active;
}

/** Wire the real PCI-scoped processor here during the integration pass. */
export function setProcessor(processor: PaymentProcessor): void {
  active = processor;
}
