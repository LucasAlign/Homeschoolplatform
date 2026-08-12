// Module I — Subscription state machine (pure logic, unit-tested).
// docs/mvp-specification.md §1/§12. One strict, mostly-forward machine:
//
//   active → past_due | canceled
//   past_due → active | canceled     (a lapsed payment may recover)
//   canceled → (terminal)            (a new subscription supersedes it)
//
// This file encodes only the LEGAL transitions, not the authority (that is
// authorize(), Owner-only) nor the funding numbers (that is provisioning.ts).
// A subscription's state never severs the protected reserve — that guarantee is
// module J's and is fed independently of billing state (invariant 7).

import { SUBSCRIPTION_TRANSITIONS, type SubscriptionState } from './types';

export const TERMINAL_SUBSCRIPTION_STATES: ReadonlySet<SubscriptionState> = new Set([
  'canceled',
]);

export function isTerminalSubscription(state: SubscriptionState): boolean {
  return TERMINAL_SUBSCRIPTION_STATES.has(state);
}

export function canTransitionSubscription(
  from: SubscriptionState,
  to: SubscriptionState,
): boolean {
  return SUBSCRIPTION_TRANSITIONS[from]?.includes(to) ?? false;
}

export class SubscriptionTransitionError extends Error {
  constructor(from: SubscriptionState, to: SubscriptionState) {
    super(`illegal subscription transition ${from} -> ${to}`);
    this.name = 'SubscriptionTransitionError';
  }
}

export function assertSubscriptionTransition(
  from: SubscriptionState,
  to: SubscriptionState,
): void {
  if (!canTransitionSubscription(from, to)) {
    throw new SubscriptionTransitionError(from, to);
  }
}
