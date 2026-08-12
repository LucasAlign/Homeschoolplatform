// Module J — vendor provider interface + a stub. Real providers (Vertex AI,
// Document AI, Cloud Vision) implement AIProvider and are wired with
// credentials during Phase 1 implementation. All providers must run on
// US-region endpoints, receive context-minimized input with no direct
// identifiers, and report the cost-units actually consumed (issue #3/#13).

import type { AIPurpose } from './types';

export interface ProviderInvocation {
  purpose: AIPurpose;
  /** Context-minimized payload — never raw identifiers or answer-key material. */
  payload: unknown;
}

export interface ProviderResponse<T = unknown> {
  output: T;
  vendor: string;
  model: string;
  feature: string;
  /** Normalized cost-units actually consumed. */
  actualUnits: number;
}

export interface AIProvider {
  readonly name: string;
  invoke<T = unknown>(call: ProviderInvocation): Promise<ProviderResponse<T>>;
}

/**
 * Placeholder provider so the pipeline is wireable before real vendor
 * credentials exist. It performs NO real AI work and must never be used in a
 * pilot or production build.
 */
export class StubProvider implements AIProvider {
  readonly name = 'stub';

  async invoke<T = unknown>(call: ProviderInvocation): Promise<ProviderResponse<T>> {
    return {
      output: { stub: true, purpose: call.purpose } as unknown as T,
      vendor: 'stub',
      model: 'stub-0',
      feature: call.purpose,
      actualUnits: 1,
    };
  }
}

let active: AIProvider = new StubProvider();

export function getProvider(): AIProvider {
  return active;
}

/** Wire the real US-region provider here during implementation. */
export function setProvider(provider: AIProvider): void {
  active = provider;
}
