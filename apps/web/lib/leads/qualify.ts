import {
  calculateFitScore,
  MUSIC_TOOL_PLATFORMS,
} from '@/lib/fit-scoring/calculator';
import { extractScriptJson } from '@/lib/ingestion/strategies/base';
import {
  detectLinktreePaidTier,
  extractLinktree,
  fetchLinktreeDocument,
} from '@/lib/ingestion/strategies/linktree';
import type { LinktreePageProps } from '@/lib/ingestion/strategies/linktree/helpers';
import { detectLinktreeVerification } from '@/lib/ingestion/strategies/linktree/paid-tier';
import type { ExtractedLink } from '@/lib/ingestion/types';

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

export interface QualificationResult {
  status: 'qualified' | 'disqualified';
  sourcePlatform: 'linktree' | 'beacons' | 'laylo';
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  contactEmail: string | null;
  hasPaidTier: boolean | null;
  isLinktreeVerified: boolean | null;
  hasSpotifyLink: boolean;
  spotifyUrl: string | null;
  hasInstagram: boolean;
  instagramHandle: string | null;
  musicToolsDetected: string[];
  hasTrackingPixels: boolean;
  trackingPixelPlatforms: string[];
  allLinks: ExtractedLink[];
  fitScore: number;
  fitScoreBreakdown: Record<string, unknown>;
  disqualificationReason: string | null;
}

export interface QualifyLeadOptions {
  /**
   * Include contact email extraction for legacy outreach qualification.
   * Public requalification explicitly disables this private-data path.
   */
  includePrivateContact?: boolean;
}

/**
 * Qualifies a Linktree URL by fetching, extracting, and evaluating signals.
 *
 * Rules:
 *  - No Spotify → disqualified ("no_spotify")
 *  - Paid tier + Spotify → qualified
 *  - Free tier + Spotify + music tool → qualified
 *  - Free tier + Spotify only → disqualified ("free_tier_no_music_tool")
 */
export async function qualifyLead(
  linktreeUrl: string,
  options: QualifyLeadOptions = {}
): Promise<QualificationResult> {
  const includePrivateContact = options.includePrivateContact !== false;
  const html = await fetchLinktreeDocument(linktreeUrl);
  const extraction = extractLinktree(html, {
    includeContactEmail: includePrivateContact,
  });
  const hasPaidTier = detectLinktreePaidTier(html);
  const nextData = extractScriptJson<LinktreePageProps>(html, '__NEXT_DATA__');
  const isLinktreeVerified = detectLinktreeVerification(html, nextData);

  const platforms = extraction.links.map(l => l.platformId).filter(Boolean);
  const hasSpotifyLink = platforms.includes('spotify');
  const spotifyLinks = extraction.links.filter(l => l.platformId === 'spotify');
  // Linktrees often list an album before the artist profile. Prefer the
  // artist URL so the existing Spotify enrichment path can resolve the
  // canonical artist without guessing from an album or track.
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
    ingestionSourcePlatform: 'linktree',
    hasPaidTier: hasPaidTier ?? undefined,
    socialLinkPlatforms: platforms as string[],
    hasSpotifyId: hasSpotifyLink,
    hasContactEmail: includePrivateContact && !!extraction.contactEmail,
    hasTrackingPixels: trackingPixelPlatforms.length > 0,
  });

  // Apply qualification rules
  // Verified + Spotify → always qualified (strongest signal)
  // Paid tier + Spotify → qualified
  // Free tier + Spotify + music tool → qualified
  // No Spotify → disqualified
  // Free tier + Spotify only → disqualified
  let status: 'qualified' | 'disqualified';
  let disqualificationReason: string | null = null;

  if (!hasSpotifyLink) {
    status = 'disqualified';
    disqualificationReason = 'no_spotify';
  } else if (isLinktreeVerified) {
    status = 'qualified';
  } else if (hasPaidTier) {
    status = 'qualified';
  } else if (musicToolsDetected.length > 0) {
    status = 'qualified';
  } else {
    status = 'disqualified';
    disqualificationReason = 'free_tier_no_music_tool';
  }

  return {
    status,
    sourcePlatform: 'linktree',
    displayName: extraction.displayName ?? null,
    bio: extraction.bio ?? null,
    avatarUrl: extraction.avatarUrl ?? null,
    contactEmail: includePrivateContact
      ? (extraction.contactEmail ?? null)
      : null,
    hasPaidTier,
    isLinktreeVerified,
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

function extractInstagramHandle(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.replace(/\/$/, '');
    return pathname.split('/').find(Boolean) ?? null;
  } catch {
    return null;
  }
}
