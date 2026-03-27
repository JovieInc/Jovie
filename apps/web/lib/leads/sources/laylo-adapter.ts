import type { QualificationResult } from '@/lib/leads/qualify';
import type { DiscoverySourceAdapter } from './types';

function unsupportedQualificationResult(): QualificationResult {
  return {
    status: 'disqualified',
    sourcePlatform: 'laylo',
    displayName: null,
    bio: null,
    avatarUrl: null,
    contactEmail: null,
    hasPaidTier: null,
    isLinktreeVerified: null,
    hasSpotifyLink: false,
    spotifyUrl: null,
    hasInstagram: false,
    instagramHandle: null,
    musicToolsDetected: [],
    hasTrackingPixels: false,
    trackingPixelPlatforms: [],
    allLinks: [],
    fitScore: 0,
    fitScoreBreakdown: {},
    disqualificationReason: 'adapter_not_enabled',
  };
}

export class LayloDiscoveryAdapter implements DiscoverySourceAdapter {
  readonly platform = 'laylo' as const;

  async discover(): Promise<string[]> {
    return [];
  }

  async qualify(_sourceUrl: string): Promise<QualificationResult> {
    return unsupportedQualificationResult();
  }

  async extractSignals(): Promise<Record<string, unknown>> {
    return {};
  }

  normalizeIdentity(): null {
    return null;
  }
}
