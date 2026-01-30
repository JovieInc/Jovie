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
   * Whether the link-in-bio appears to be on a paid tier.
   * Detected by absence of platform branding (e.g., "Made with Linktree").
   * null = not detected, true = paid tier, false = free tier with branding
   */
  hasPaidTier?: boolean | null;
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
}

export interface NormalizedLinkCandidate extends ExtractedLink {
  normalizedUrl: string;
  canonicalIdentity: string;
  state: SocialLinkState;
  confidence: number;
}
