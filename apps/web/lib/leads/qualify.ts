import { disabledSocialHtmlDocument } from '@/lib/ingestion/social-html-policy';
import { ExtractionError } from '@/lib/ingestion/strategies/base';
import { validateLinktreeUrl } from '@/lib/ingestion/strategies/linktree';
import type { ExtractedLink } from '@/lib/ingestion/types';

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

/** Linktree URL qualification requires an official API integration. */
export async function qualifyLead(
  linktreeUrl: string,
  _options: QualifyLeadOptions = {}
): Promise<QualificationResult> {
  if (!validateLinktreeUrl(linktreeUrl)) {
    throw new ExtractionError('Invalid Linktree URL', 'INVALID_URL');
  }
  return disabledSocialHtmlDocument();
}
