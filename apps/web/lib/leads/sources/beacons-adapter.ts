import type { QualificationResult } from '@/lib/leads/qualify';
import { createDisabledAdapterResult } from './qualification-helpers';
import type { DiscoverySourceAdapter } from './types';

export class BeaconsDiscoveryAdapter implements DiscoverySourceAdapter {
  readonly platform = 'beacons' as const;

  async discover(): Promise<string[]> {
    return [];
  }

  async qualify(_sourceUrl: string): Promise<QualificationResult> {
    return createDisabledAdapterResult('beacons');
  }

  async extractSignals(): Promise<Record<string, unknown>> {
    return {};
  }

  normalizeIdentity(): null {
    return null;
  }
}
