import type { QualificationResult } from '@/lib/leads/qualify';
import type { DiscoverySourceIdentity } from './types';

export function createDisabledAdapterResult(
  platform: DiscoverySourceIdentity['sourcePlatform']
): QualificationResult {
  return {
    status: 'disqualified',
    sourcePlatform: platform,
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
