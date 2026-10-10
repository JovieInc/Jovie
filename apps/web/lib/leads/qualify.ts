import {
  calculateFitScore,
  MUSIC_TOOL_PLATFORMS,
  projectObservedQualificationFitInput,
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
import { decideLeadQualification } from '@/lib/leads/qualification-decision';

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
 * Identity-only qualification for the legacy outreach pipeline. A public
 * display name plus any public link qualifies; Spotify is an observed signal,
 * never a prerequisite.
 * Public badges, branding, and tool links are observations, never proof of
 * paid access or commercial intent.
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
  const spotifyLinks = extraction.links.filter(l => l.platformId === 'spotify');
  const spotifyLink = spotifyLinks.find(link =>
    /^https:\/\/open\.spotify\.com\/artist\/[a-z0-9]+\/?(?:\?.*)?$/i.test(
      link.url
    )
  );
  const hasSpotifyLink = Boolean(spotifyLink);
  const instagramLink = extraction.links.find(
    l => l.platformId === 'instagram'
  );
  const musicToolsDetected = [
    ...new Set(platforms.filter(p => MUSIC_TOOL_PLATFORMS.has(p!))),
  ] as string[];
  const trackingPixelPlatforms = Object.keys(
    extraction.discoveredPixels ?? {}
  ).sort((left, right) => left.localeCompare(right));

  const fitResult = calculateFitScore(
    projectObservedQualificationFitInput({
      sourcePlatform: 'linktree',
      hasPaidTier,
      linkPlatforms: extraction.links.map(link => link.platformId),
      hasSpotifyArtist: hasSpotifyLink,
      hasContactEmail: includePrivateContact && !!extraction.contactEmail,
      hasTrackingPixels: trackingPixelPlatforms.length > 0,
    })
  );

  // Preserve the old binary return shape, but stop silently certifying
  // unsupported commercial inferences. The job-aware v2 contract records the
  // corresponding tri-state decisions and review reasons.
  const decision = decideLeadQualification({
    displayName: extraction.displayName ?? null,
    links: extraction.links,
  });
  const status = decision.status;
  const disqualificationReason = decision.disqualificationReason;

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
