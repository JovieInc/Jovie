/**
 * YouTube Cross-Category Handler
 *
 * Handles YouTube-specific logic.
 */

import type { LinkSection } from '../utils/link-categorization';

/**
 * Result of YouTube cross-category check.
 */
export interface YouTubeCrossCategoryResult {
  /** Whether to show the cross-category prompt */
  shouldPrompt: boolean;
  /** Target section for the prompt ('social' or 'dsp') */
  targetSection: 'social' | 'dsp' | null;
  /** Whether to skip adding the link (already in both sections) */
  shouldSkip: boolean;
}

/**
 * Determines YouTube-specific behavior.
 *
 * YouTube is treated as a social platform. Cross-category prompting is disabled.
 *
 * @param platformId - Platform ID of the link being added
 * @param sameSectionHas - Whether the same section already has this platform
 * @param otherSectionHas - Whether the other section already has this platform
 * @param otherSection - The other section ('social' or 'dsp')
 * @returns YouTube cross-category result
 */
export function checkYouTubeCrossCategory(
  platformId: string,
  sameSectionHas: boolean,
  otherSectionHas: boolean,
  otherSection: 'social' | 'dsp' | null
): YouTubeCrossCategoryResult {
  void platformId;
  void sameSectionHas;
  void otherSectionHas;
  void otherSection;
  return { shouldPrompt: false, targetSection: null, shouldSkip: false };
}

/**
 * Checks if a duplicate should be merged for YouTube links.
 *
 * @param platformId - Platform ID of the link
 * @param duplicateIndex - Index of duplicate (-1 if none)
 * @param duplicateSection - Section of the duplicate
 * @param currentSection - Section of the link being added
 * @param hasCrossSectionDuplicate - Whether duplicate is in different section
 * @returns Whether to merge the duplicate
 */
export function shouldMergeYouTubeDuplicate(
  platformId: string,
  duplicateIndex: number,
  duplicateSection: LinkSection | null,
  currentSection: LinkSection,
  hasCrossSectionDuplicate: boolean
): boolean {
  return (
    platformId === 'youtube' &&
    duplicateIndex !== -1 &&
    !hasCrossSectionDuplicate &&
    duplicateSection === currentSection
  );
}
