/**
 * Link Deduplication Service
 *
 * Handles canonical identity matching for social links.
 */

import type { socialLinks } from '@/lib/db/schema/links';
import {
  canonicalIdentity,
  detectPlatform,
} from '@/lib/utils/platform-detection';

type SocialLinkRow = typeof socialLinks.$inferSelect;

/**
 * Builds a map of existing links indexed by canonical identity.
 * Skips rows with unparseable URLs.
 *
 * @param existingRows - Database rows to index
 * @returns Map of canonical identity to social link row
 */
export function buildCanonicalIndex(
  existingRows: SocialLinkRow[]
): Map<string, SocialLinkRow> {
  const index = new Map<string, SocialLinkRow>();

  for (const row of existingRows) {
    try {
      const detected = detectPlatform(row.url);
      const canonical = canonicalIdentity({
        platform: detected.platform,
        normalizedUrl: detected.normalizedUrl,
      });
      index.set(canonical, row);
    } catch {
      // Skip rows with unparseable URLs; ingestion will not mutate them
    }
  }

  return index;
}

/**
 * Gets canonical identity for a URL.
 * Returns null if URL cannot be parsed.
 *
 * @param url - The URL to canonicalize
 * @returns Canonical identity string or null
 */
export function getCanonicalIdentity(url: string): string | null {
  try {
    const detected = detectPlatform(url);
    if (!detected.isValid) return null;

    return canonicalIdentity({
      platform: detected.platform,
      normalizedUrl: detected.normalizedUrl,
    });
  } catch {
    return null;
  }
}
