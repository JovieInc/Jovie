import {
  calculateFitScore,
  MUSIC_TOOL_PLATFORMS,
} from '@/lib/fit-scoring/calculator';
import {
  detectLinktreePaidTier,
  extractLinktree,
  fetchLinktreeDocument,
} from '@/lib/ingestion/strategies/linktree';
import type { ExtractedLink } from '@/lib/ingestion/types';

export interface QualificationResult {
  status: 'qualified' | 'disqualified';
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  contactEmail: string | null;
  hasPaidTier: boolean | null;
  hasSpotifyLink: boolean;
  spotifyUrl: string | null;
  hasInstagram: boolean;
  instagramHandle: string | null;
  musicToolsDetected: string[];
  allLinks: ExtractedLink[];
  fitScore: number;
  fitScoreBreakdown: Record<string, unknown>;
  disqualificationReason: string | null;
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
  linktreeUrl: string
): Promise<QualificationResult> {
  const html = await fetchLinktreeDocument(linktreeUrl);
  const extraction = extractLinktree(html);
  const hasPaidTier = detectLinktreePaidTier(html);

  const platforms = extraction.links.map(l => l.platformId).filter(Boolean);
  const hasSpotifyLink = platforms.includes('spotify');
  const spotifyLink = extraction.links.find(l => l.platformId === 'spotify');
  const instagramLink = extraction.links.find(
    l => l.platformId === 'instagram'
  );
  const musicToolsDetected = platforms.filter(p =>
    MUSIC_TOOL_PLATFORMS.has(p!)
  ) as string[];

  const fitResult = calculateFitScore({
    ingestionSourcePlatform: 'linktree',
    hasPaidTier: hasPaidTier ?? undefined,
    socialLinkPlatforms: platforms as string[],
    hasSpotifyId: hasSpotifyLink,
    hasContactEmail: !!extraction.contactEmail,
  });

  // Apply qualification rules
  let status: 'qualified' | 'disqualified';
  let disqualificationReason: string | null = null;

  if (!hasSpotifyLink) {
    status = 'disqualified';
    disqualificationReason = 'no_spotify';
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
    displayName: extraction.displayName ?? null,
    bio: extraction.bio ?? null,
    avatarUrl: extraction.avatarUrl ?? null,
    contactEmail: extraction.contactEmail ?? null,
    hasPaidTier,
    hasSpotifyLink,
    spotifyUrl: spotifyLink?.url ?? null,
    hasInstagram: !!instagramLink,
    instagramHandle: instagramLink
      ? extractInstagramHandle(instagramLink.url)
      : null,
    musicToolsDetected,
    allLinks: extraction.links,
    fitScore: fitResult.score,
    fitScoreBreakdown: fitResult.breakdown as unknown as Record<
      string,
      unknown
    >,
    disqualificationReason,
  };
}

function extractInstagramHandle(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.replace(/\/$/, '');
    const segments = pathname.split('/').filter(Boolean);
    return segments[0] ?? null;
  } catch {
    return null;
  }
}
