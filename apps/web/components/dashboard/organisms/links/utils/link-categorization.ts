/**
 * Link Categorization Utilities
 *
 * Pure utility functions for categorizing and grouping links by section.
 * These functions handle the logic for determining which section a link belongs to
 * and whether links can be moved between sections.
 */

import type { DetectedLink } from '@/lib/utils/platform-detection';
import type { LinkSection } from './link-display-utils';

// Re-export LinkSection for convenience
export type { LinkSection } from './link-display-utils';

/**
 * Cross-category policy configuration
 *
 * Defines which platforms are allowed to exist in multiple sections.
 * For example, YouTube can appear in both 'social' and 'dsp' (music service) sections.
 *
 * Key: platform ID
 * Value: Array of sections the platform can appear in
 */
export const CROSS_CATEGORY: Record<
  string,
  Array<'social' | 'dsp' | 'earnings' | 'websites' | 'custom'>
> = {
  youtube: ['social', 'dsp'],
  // soundcloud: ['social', 'dsp'],
};

/**
 * Determine the section a link belongs to based on its platform category
 *
 * Maps platform categories to UI sections. The 'websites' category maps to 'custom'.
 *
 * @param link - A link object with platform information
 * @returns The section the link belongs to
 */
export function sectionOf<T extends DetectedLink>(link: T): LinkSection {
  const category = (link.platform.category ?? 'custom') as
    | 'social'
    | 'dsp'
    | 'earnings'
    | 'websites'
    | 'custom';

  if (category === 'social') return 'social';
  if (category === 'dsp') return 'dsp';
  if (category === 'earnings') return 'earnings';
  return 'custom';
}

/**
 * Check if a link can be moved to a target section
 *
 * A link can always be moved within its own section. Cross-section movement
 * is only allowed for platforms defined in CROSS_CATEGORY.
 *
 * @param link - The link to check
 * @param target - The target section
 * @returns True if the link can be moved to the target section
 */
export function canMoveTo<T extends DetectedLink>(
  link: T,
  target: LinkSection
): boolean {
  const current = sectionOf(link);
  if (current === target) return true;
  const allowed = CROSS_CATEGORY[link.platform.id] ?? [];
  return allowed.includes(target);
}

/**
 * Group links by their section
 *
 * Takes an array of links and groups them into their respective sections
 * (social, dsp, earnings, custom) while preserving the original order within each group.
 *
 * @param links - Array of links to group
 * @returns Record with arrays of links organized by section
 */
export function groupLinks<T extends DetectedLink = DetectedLink>(
  links: T[]
): Record<LinkSection, T[]> {
  // Preserve incoming order; categories are only for grouping/drag between types.
  const social: T[] = [];
  const dsp: T[] = [];
  const earnings: T[] = [];
  const custom: T[] = [];

  for (const l of links) {
    // Category comes from platform metadata; fallback to custom
    const category = (l.platform.category ?? 'custom') as
      | 'social'
      | 'dsp'
      | 'websites'
      | 'earnings'
      | 'custom';
    if (category === 'social') social.push(l);
    else if (category === 'dsp') dsp.push(l);
    else if (category === 'earnings') earnings.push(l);
    else custom.push(l);
  }

  return {
    social,
    dsp,
    earnings,
    custom,
  };
}
