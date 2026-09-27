import type { DiscoveredPixels } from '@/lib/db/schema/profiles';
import { type SocialLinkState } from '@/types/db';

export interface IngestionJobPayload {
  creatorProfileId: string;
  sourceUrl: string;
  dedupKey?: string;
  depth?: number;
}

export interface ExtractedLink {
  url: string;
  platformId?: string;
  title?: string;
  sourcePlatform?: string;
  evidence?: {
    sources?: string[];
    signals?: string[];
  };
}

export interface ExtractionResult {
  links: ExtractedLink[];
  /** Source platform for provenance storage (e.g., linktree, instagram). */
  sourcePlatform?: string | null;
  /** Source URL used for extraction (normalized). */
  sourceUrl?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  /**
   * Legacy compatibility field. `false` means platform branding was observed;
   * `null` means billing access is unknown. Public presentation must never set
   * this to `true`; only approved first-party billing evidence may do so.
   */
  hasPaidTier?: boolean | null;
  /**
   * Whether the Linktree profile has a verification badge.
   * This is identity/badge evidence, not paid-plan evidence.
   */
  isLinktreeVerified?: boolean | null;
  /**
   * Contact email extracted from bio or content.
   * May be null if no email was found.
   */
  contactEmail?: string | null;
  /**
   * Bio/description text extracted from the profile.
   * Used for context and email extraction.
   */
  bio?: string | null;
  /**
   * Tracking pixels detected on the profile page (Facebook, TikTok, Google).
   * Detected by matching pixel init calls in the HTML.
   * null = no pixels detected or detection not performed.
   */
  discoveredPixels?: DiscoveredPixels | null;
}

export interface NormalizedLinkCandidate extends ExtractedLink {
  normalizedUrl: string;
  canonicalIdentity: string;
  state: SocialLinkState;
  confidence: number;
}
