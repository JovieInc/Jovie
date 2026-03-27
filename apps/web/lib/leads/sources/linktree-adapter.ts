import {
  extractLinktreeHandle,
  isLinktreeUrl,
} from '@/lib/ingestion/strategies/linktree';
import { searchGoogleCSE } from '@/lib/leads/google-cse';
import { qualifyLead } from '@/lib/leads/qualify';
import type { DiscoverySourceAdapter } from './types';

export class LinktreeDiscoveryAdapter implements DiscoverySourceAdapter {
  readonly platform = 'linktree' as const;

  async discover(settings: { keywords: string[] }): Promise<string[]> {
    const [firstKeyword] = settings.keywords;
    if (!firstKeyword) return [];
    const results = await searchGoogleCSE(firstKeyword, 1);
    return results.map(result => result.link);
  }

  async qualify(sourceUrl: string) {
    return qualifyLead(sourceUrl);
  }

  async extractSignals(sourceUrl: string) {
    const qualification = await qualifyLead(sourceUrl);
    return {
      sourcePlatform: qualification.sourcePlatform,
      hasPaidTier: qualification.hasPaidTier,
      isLinktreeVerified: qualification.isLinktreeVerified,
      hasTrackingPixels: qualification.hasTrackingPixels,
      trackingPixelPlatforms: qualification.trackingPixelPlatforms,
      musicToolsDetected: qualification.musicToolsDetected,
    };
  }

  normalizeIdentity(sourceUrl: string) {
    if (!isLinktreeUrl(sourceUrl)) return null;
    const sourceHandle = extractLinktreeHandle(sourceUrl);
    if (!sourceHandle) return null;
    return {
      sourcePlatform: this.platform,
      sourceHandle,
      sourceUrl: `https://linktr.ee/${sourceHandle}`,
    };
  }
}
