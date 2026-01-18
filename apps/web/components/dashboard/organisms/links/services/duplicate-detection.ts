/**
 * Duplicate Detection Service
 *
 * Handles duplicate link detection using canonical identity matching.
 */

import {
  canonicalIdentity,
  type DetectedLink,
} from '@/lib/utils/platform-detection';
import { sectionOf } from '../utils';

/**
 * Result of duplicate detection.
 */
export interface DuplicateDetectionResult<T extends DetectedLink> {
  /** Index of duplicate link, or -1 if not found */
  duplicateIndex: number;
  /** The duplicate link, or null if not found */
  duplicate: T | null;
  /** Section of the duplicate link, or null if not found */
  duplicateSection: 'social' | 'dsp' | 'earnings' | null;
  /** Whether the duplicate is in a different section */
  hasCrossSectionDuplicate: boolean;
}

/**
 * Finds a duplicate link in the existing links array.
 * Uses canonical identity to match platform + normalized URL.
 *
 * @param link - Link to check for duplicates
 * @param existingLinks - Array of existing links
 * @param currentSection - Section of the link being added
 * @returns Duplicate detection result
 */
export function findDuplicate<T extends DetectedLink>(
  link: DetectedLink,
  existingLinks: T[],
  currentSection: 'social' | 'dsp' | 'earnings'
): DuplicateDetectionResult<T> {
  const canonicalId = canonicalIdentity({
    platform: link.platform,
    normalizedUrl: link.normalizedUrl,
  });

  const duplicateIndex = existingLinks.findIndex(
    existing =>
      canonicalIdentity({
        platform: (existing as DetectedLink).platform,
        normalizedUrl: (existing as DetectedLink).normalizedUrl,
      }) === canonicalId
  );

  const duplicate =
    duplicateIndex !== -1 ? existingLinks[duplicateIndex] : null;
  const duplicateSection = duplicate ? sectionOf(duplicate as T) : null;

  const hasCrossSectionDuplicate =
    link.platform.id === 'youtube' &&
    duplicateSection !== null &&
    duplicateSection !== currentSection;

  return {
    duplicateIndex,
    duplicate,
    duplicateSection,
    hasCrossSectionDuplicate,
  };
}

/**
 * Merges a new link's data into an existing duplicate.
 *
 * @param duplicate - Existing duplicate link
 * @param newLink - New link with updated data
 * @returns Merged link
 */
export function mergeDuplicate<T extends DetectedLink>(
  duplicate: T,
  newLink: DetectedLink
): T {
  return {
    ...duplicate,
    normalizedUrl: newLink.normalizedUrl,
    suggestedTitle: newLink.suggestedTitle,
  } as T;
}
