/**
 * YouTube Cross-Category Handler
 *
 * Handles YouTube-specific logic for cross-category placement (social + dsp).
 */

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
 * Determines YouTube cross-category behavior.
 *
 * YouTube links can exist in both social and dsp sections simultaneously.
 * This function decides whether to:
 * - Show a prompt to add to the other section
 * - Skip adding (already in both sections)
 * - Proceed with normal add
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
  if (platformId !== 'youtube') {
    return { shouldPrompt: false, targetSection: null, shouldSkip: false };
  }

  // YouTube: already in this section, prompt for other section
  if (sameSectionHas && !otherSectionHas && otherSection) {
    return {
      shouldPrompt: true,
      targetSection: otherSection,
      shouldSkip: false,
    };
  }

  // YouTube: already in both sections - skip
  if (sameSectionHas && otherSectionHas) {
    return { shouldPrompt: false, targetSection: null, shouldSkip: true };
  }

  return { shouldPrompt: false, targetSection: null, shouldSkip: false };
}

/**
 * Checks if a duplicate should be merged for YouTube links.
 *
 * YouTube allows cross-section duplicates, but same-section duplicates
 * should be merged.
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
  duplicateSection: 'social' | 'dsp' | 'earnings' | null,
  currentSection: 'social' | 'dsp' | 'earnings',
  hasCrossSectionDuplicate: boolean
): boolean {
  if (platformId !== 'youtube') {
    return false;
  }

  // No duplicate found
  if (duplicateIndex === -1) {
    return false;
  }

  // Cross-section duplicate - don't merge (allow both)
  if (hasCrossSectionDuplicate) {
    return false;
  }

  // Same section duplicate - merge
  return duplicateSection === currentSection;
}
