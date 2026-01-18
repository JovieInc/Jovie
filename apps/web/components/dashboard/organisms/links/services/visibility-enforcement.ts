/**
 * Visibility Enforcement Service
 *
 * Enforces MAX_SOCIAL_LINKS visibility rules.
 */

import { MAX_SOCIAL_LINKS } from '@/constants/app';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { type LinkSection, sectionOf } from '../utils/link-categorization';

/**
 * Checks if a link is visible.
 *
 * @param link - Link to check
 * @returns Whether the link is visible
 */
export function isLinkVisible<T extends DetectedLink>(link: T): boolean {
  return (
    ((link as unknown as { isVisible?: boolean }).isVisible ?? true) !== false
  );
}

/**
 * Counts visible links in a specific section.
 *
 * @param links - Array of links
 * @param section - Section to count ('social', 'dsp', or 'earnings')
 * @returns Count of visible links in the section
 */
export function countVisibleInSection<T extends DetectedLink>(
  links: T[],
  section: LinkSection
): number {
  return links.filter(
    link => sectionOf(link as T) === section && isLinkVisible(link as T)
  ).length;
}

/**
 * Determines if a new link should be visible based on MAX_SOCIAL_LINKS.
 *
 * Only applies to social section. If the section already has MAX_SOCIAL_LINKS
 * visible links, the new link should be hidden.
 *
 * @param links - Existing links array
 * @param section - Section of the new link
 * @returns Whether the new link should be visible
 */
export function shouldLinkBeVisible<T extends DetectedLink>(
  links: T[],
  section: LinkSection
): boolean {
  if (section !== 'social') {
    return true; // No visibility limit for non-social sections
  }

  const socialVisibleCount = countVisibleInSection(links, 'social');
  return socialVisibleCount < MAX_SOCIAL_LINKS;
}

/**
 * Applies visibility rules to a link.
 *
 * @param link - Link to apply visibility to
 * @param shouldBeVisible - Whether the link should be visible
 * @returns Link with visibility applied
 */
export function applyVisibility<T extends DetectedLink>(
  link: T,
  shouldBeVisible: boolean
): T {
  if (shouldBeVisible) {
    return link; // Already visible by default
  }

  return {
    ...link,
    isVisible: false,
  } as unknown as T;
}
