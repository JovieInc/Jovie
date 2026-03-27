import type { QualificationResult } from '@/lib/leads/qualify';

export interface DiscoverySourceIdentity {
  sourcePlatform: 'linktree' | 'beacons' | 'laylo';
  sourceHandle: string;
  sourceUrl: string;
}

export interface DiscoverySourceAdapter {
  readonly platform: DiscoverySourceIdentity['sourcePlatform'];
  discover(settings: { keywords: string[] }): Promise<string[]>;
  qualify(sourceUrl: string): Promise<QualificationResult>;
  extractSignals(sourceUrl: string): Promise<Record<string, unknown>>;
  normalizeIdentity(sourceUrl: string): DiscoverySourceIdentity | null;
}
