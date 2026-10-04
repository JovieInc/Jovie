/**
 * Extraction Result Utilities
 *
 * Functions for creating extraction results.
 */

import { cleanScrapedDisplayName } from '@/lib/profile/scraped-display-name';
import type { ExtractedLink, ExtractionResult } from '../../types';

/**
 * Creates a standard extraction result. Display names drop scraped page-title
 * chrome ("Name | Instagram, Facebook", "Name - Listen on Spotify") so new
 * ingests never store a tab title as a name (JOV-7753).
 */
export function createExtractionResult(
  links: ExtractedLink[],
  displayName: string | null,
  avatarUrl: string | null,
  hasPaidTier?: boolean | null
): ExtractionResult {
  return {
    links,
    displayName: cleanScrapedDisplayName(displayName),
    avatarUrl,
    hasPaidTier: hasPaidTier ?? null,
  };
}
