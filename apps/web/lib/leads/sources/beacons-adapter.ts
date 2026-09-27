import {
  calculateFitScore,
  MUSIC_TOOL_PLATFORMS,
} from '@/lib/fit-scoring/calculator';
import {
  BEACONS_CONFIG,
  detectBeaconsPaidTier,
  extractBeacons,
  extractBeaconsHandle,
  fetchBeaconsDocument,
  isBeaconsUrl,
} from '@/lib/ingestion/strategies/beacons';
import { searchGoogleCSEWithStatus } from '@/lib/leads/google-cse';
import type { QualificationResult } from '@/lib/leads/qualify';
import type { DiscoverySourceAdapter } from './types';

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function extractInstagramHandle(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.replace(/\/$/, '');
    return pathname.split('/').find(Boolean) ?? null;
  } catch {
    return null;
  }
}

/**
 * Qualifies a Beacons.ai profile using the same eligibility rules as Linktree:
 * Spotify required; paid tier or a detected music tool upgrades to qualified.
 * Beacons has no verification-badge signal, so `isLinktreeVerified` stays null.
 * No contact email is extracted (private-data path stays disabled here).
 */
async function qualifyBeaconsProfile(
  sourceUrl: string
): Promise<QualificationResult> {
  const html = await fetchBeaconsDocument(sourceUrl);
  const extraction = extractBeacons(html);
  const hasPaidTier = detectBeaconsPaidTier(html);

  const platforms = extraction.links.map(l => l.platformId).filter(Boolean);
  const hasSpotifyLink = platforms.includes('spotify');
  const spotifyLinks = extraction.links.filter(l => l.platformId === 'spotify');
  const spotifyLink =
    spotifyLinks.find(link => /\/artist\//i.test(link.url)) ?? spotifyLinks[0];
  const instagramLink = extraction.links.find(
    l => l.platformId === 'instagram'
  );
  const musicToolsDetected = platforms.filter(p =>
    MUSIC_TOOL_PLATFORMS.has(p!)
  ) as string[];
  const trackingPixelPlatforms = Object.keys(
    extraction.discoveredPixels ?? {}
  ).sort((left, right) => left.localeCompare(right));

  const fitResult = calculateFitScore({
    ingestionSourcePlatform: 'beacons',
    hasPaidTier: hasPaidTier ?? undefined,
    socialLinkPlatforms: platforms as string[],
    hasSpotifyId: hasSpotifyLink,
    hasContactEmail: false,
    hasTrackingPixels: trackingPixelPlatforms.length > 0,
  });

  let status: 'qualified' | 'disqualified';
  let disqualificationReason: string | null = null;

  if (!hasSpotifyLink) {
    status = 'disqualified';
    disqualificationReason = 'no_spotify';
  } else if (hasPaidTier || musicToolsDetected.length > 0) {
    status = 'qualified';
  } else {
    status = 'disqualified';
    disqualificationReason = 'free_tier_no_music_tool';
  }

  return {
    status,
    sourcePlatform: 'beacons',
    displayName: extraction.displayName ?? null,
    bio: extraction.bio ?? null,
    avatarUrl: extraction.avatarUrl ?? null,
    contactEmail: null,
    hasPaidTier,
    isLinktreeVerified: null,
    hasSpotifyLink,
    spotifyUrl: spotifyLink?.url ?? null,
    hasInstagram: !!instagramLink,
    instagramHandle: instagramLink
      ? extractInstagramHandle(instagramLink.url)
      : null,
    musicToolsDetected,
    hasTrackingPixels: trackingPixelPlatforms.length > 0,
    trackingPixelPlatforms,
    allLinks: extraction.links,
    fitScore: fitResult.score,
    fitScoreBreakdown: toRecord(fitResult.breakdown),
    disqualificationReason,
  };
}

export class BeaconsDiscoveryAdapter implements DiscoverySourceAdapter {
  readonly platform = 'beacons' as const;

  async discover(settings: { keywords: string[] }): Promise<string[]> {
    const [firstKeyword] = settings.keywords;
    if (!firstKeyword) return [];
    const outcome = await searchGoogleCSEWithStatus(firstKeyword, 1);
    if (outcome.status !== 'ok') return [];
    return outcome.results.map(result => result.link).filter(isBeaconsUrl);
  }

  async qualify(sourceUrl: string): Promise<QualificationResult> {
    return qualifyBeaconsProfile(sourceUrl);
  }

  async extractSignals(sourceUrl: string): Promise<Record<string, unknown>> {
    const qualification = await qualifyBeaconsProfile(sourceUrl);
    return {
      sourcePlatform: qualification.sourcePlatform,
      hasPaidTier: qualification.hasPaidTier,
      hasTrackingPixels: qualification.hasTrackingPixels,
      trackingPixelPlatforms: qualification.trackingPixelPlatforms,
      musicToolsDetected: qualification.musicToolsDetected,
    };
  }

  normalizeIdentity(sourceUrl: string) {
    if (!isBeaconsUrl(sourceUrl)) return null;
    const sourceHandle = extractBeaconsHandle(sourceUrl);
    if (!sourceHandle) return null;
    return {
      sourcePlatform: this.platform,
      sourceHandle,
      sourceUrl: `https://${BEACONS_CONFIG.canonicalHost}/${sourceHandle}`,
    };
  }
}
