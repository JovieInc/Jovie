import type { QualificationResult } from '@/lib/leads/qualify';
import { createDisabledAdapterResult } from './qualification-helpers';
import type { DiscoverySourceAdapter } from './types';

export class LayloDiscoveryAdapter implements DiscoverySourceAdapter {
  readonly platform = 'laylo' as const;

  async discover(): Promise<string[]> {
    return [];
  }

  async qualify(_sourceUrl: string): Promise<QualificationResult> {
    return createDisabledAdapterResult('laylo');
  }

  async extractSignals(): Promise<Record<string, unknown>> {
    return {};
  }

  normalizeIdentity(): null {
    return null;
  }
}
