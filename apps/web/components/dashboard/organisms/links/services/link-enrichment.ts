/**
 * Link Enrichment Service
 *
 * Handles initial link preparation including:
 * - Adding isVisible flag
 * - Venmo platform category forcing
 * - Section determination
 */

import type { DetectedLink } from '@/lib/utils/platform-detection';
import { type LinkSection, sectionOf } from '../utils/link-categorization';

/**
 * Enriches a link with default values and platform-specific adjustments.
 *
 * Special cases:
 * - Venmo: Always force to 'earnings' category
 * - All links: Set isVisible: true by default
 *
 * @param link - Detected link to enrich
 * @returns Enriched link with isVisible and platform adjustments
 */
export function enrichLink<T extends DetectedLink>(link: DetectedLink): T {
  const enriched = {
    isVisible: true,
    ...link,
  } as unknown as T;

  // Special handling for Venmo - force earnings category
  if ((enriched as DetectedLink).platform.id === 'venmo') {
    (enriched as DetectedLink).platform = {
      ...(enriched as DetectedLink).platform,
      category: 'earnings' as unknown as 'social',
    } as DetectedLink['platform'];
  }

  return enriched;
}

/**
 * Gets the section and other section for cross-section checks.
 *
 * @param link - Link to get sections for
 * @returns Object with section and otherSection
 */
export function getSections<T extends DetectedLink>(
  link: T
): {
  section: LinkSection;
  otherSection: 'social' | 'dsp' | null;
} {
  const section = sectionOf(link);
  let otherSection: 'social' | 'dsp' | null = null;
  if (section === 'social') {
    otherSection = 'dsp';
  } else if (section === 'dsp') {
    otherSection = 'social';
  }

  return { section, otherSection };
}
