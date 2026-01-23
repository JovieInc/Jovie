'use client';

/**
 * useMultiLinkPaste Hook
 *
 * Handles detection and extraction of multiple URLs from pasted text.
 * Shows a review dialog when 2+ URLs are detected.
 */

import { useCallback, useState } from 'react';

import {
  type DetectedLink,
  detectPlatform,
} from '@/lib/utils/platform-detection';

/** Maximum URLs to extract to prevent UI overload */
const MAX_URLS = 20;

/** Minimum URLs required to trigger multi-link dialog */
const MIN_URLS_FOR_DIALOG = 2;

/**
 * URL extraction regex - matches most URL formats.
 * Excludes common trailing punctuation that's often not part of URLs.
 */
const URL_REGEX = /https?:\/\/[^\s<>"'{}|\\^`[\]]+/gi;

/**
 * Clean up extracted URLs by removing trailing punctuation.
 */
function cleanUrl(url: string): string {
  // Remove trailing punctuation that's likely not part of the URL
  return url.replace(/[.,;:!?)]+$/, '');
}

/**
 * Extract unique URLs from text content.
 */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX) || [];
  const cleaned = matches.map(cleanUrl);
  const unique = [...new Set(cleaned)];
  return unique.slice(0, MAX_URLS);
}

export interface ExtractedLinkInfo {
  detectedLink: DetectedLink;
  isDuplicate: boolean;
  isSelected: boolean;
}

export interface MultiLinkPasteState {
  isOpen: boolean;
  extractedLinks: ExtractedLinkInfo[];
}

export interface UseMultiLinkPasteOptions {
  existingPlatforms: string[];
  creatorName?: string;
  onBatchAdd: (links: DetectedLink[]) => void;
}

export interface UseMultiLinkPasteReturn {
  multiLinkState: MultiLinkPasteState;
  handlePaste: (e: React.ClipboardEvent<HTMLInputElement>) => boolean;
  handleDialogClose: () => void;
  handleConfirmAdd: () => void;
  toggleLinkSelection: (index: number) => void;
  selectableCount: number;
}

const initialState: MultiLinkPasteState = {
  isOpen: false,
  extractedLinks: [],
};

export function useMultiLinkPaste({
  existingPlatforms,
  creatorName,
  onBatchAdd,
}: UseMultiLinkPasteOptions): UseMultiLinkPasteReturn {
  const [multiLinkState, setMultiLinkState] =
    useState<MultiLinkPasteState>(initialState);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>): boolean => {
      const text = e.clipboardData.getData('text');
      const urls = extractUrls(text);

      // Only intercept if we have multiple URLs
      if (urls.length < MIN_URLS_FOR_DIALOG) {
        return false; // Let normal paste behavior continue
      }

      e.preventDefault();

      const existingSet = new Set(existingPlatforms);

      const extractedLinks: ExtractedLinkInfo[] = urls
        .map(url => {
          const detectedLink = detectPlatform(url, creatorName);
          const isDuplicate = existingSet.has(detectedLink.platform.id);
          return {
            detectedLink,
            isDuplicate,
            isSelected: !isDuplicate && detectedLink.isValid,
          };
        })
        .filter(info => info.detectedLink.isValid);

      if (extractedLinks.length < MIN_URLS_FOR_DIALOG) {
        // Not enough valid links - let user paste normally
        return false;
      }

      setMultiLinkState({
        isOpen: true,
        extractedLinks,
      });

      return true; // Paste was handled
    },
    [creatorName, existingPlatforms]
  );

  const handleDialogClose = useCallback(() => {
    setMultiLinkState(initialState);
  }, []);

  const handleConfirmAdd = useCallback(() => {
    const linksToAdd = multiLinkState.extractedLinks
      .filter(info => info.isSelected && !info.isDuplicate)
      .map(info => info.detectedLink);

    if (linksToAdd.length > 0) {
      onBatchAdd(linksToAdd);
    }

    setMultiLinkState(initialState);
  }, [multiLinkState.extractedLinks, onBatchAdd]);

  const toggleLinkSelection = useCallback((index: number) => {
    setMultiLinkState(prev => ({
      ...prev,
      extractedLinks: prev.extractedLinks.map((info, i) =>
        i === index ? { ...info, isSelected: !info.isSelected } : info
      ),
    }));
  }, []);

  const selectableCount = multiLinkState.extractedLinks.filter(
    info => info.isSelected && !info.isDuplicate
  ).length;

  return {
    multiLinkState,
    handlePaste,
    handleDialogClose,
    handleConfirmAdd,
    toggleLinkSelection,
    selectableCount,
  };
}
