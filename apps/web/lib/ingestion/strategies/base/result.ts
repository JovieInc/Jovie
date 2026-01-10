/**
 * Extraction Result Utilities
 *
 * Functions for creating extraction results.
 */

import type { ExtractedLink, ExtractionResult } from '../../types';

/**
 * Creates a standard extraction result.
 */
export function createExtractionResult(
  links: ExtractedLink[],
  displayName: string | null,
  avatarUrl: string | null,
  hasPaidTier?: boolean | null
): ExtractionResult {
  return {
    links,
    displayName,
    avatarUrl,
    hasPaidTier: hasPaidTier ?? null,
  };
}
