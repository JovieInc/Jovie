'use client';

import { useCallback } from 'react';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import type { SuggestedLink } from '../links/hooks';
import { sectionOf } from '../links/utils';

interface UseSuggestionHandlersProps<T extends DetectedLink> {
  existingNormalizedUrlPlatforms: Map<string, Set<string>>;
  setLinks: React.Dispatch<React.SetStateAction<T[]>>;
  insertLinkWithSectionOrdering: (prev: T[], link: T) => T[];
  onLinkAdded?: (links: T[]) => void;
  handleAcceptSuggestionFromHook: (
    suggestion: SuggestedLink
  ) => Promise<DetectedLink | null>;
  handleDismissSuggestionFromHook: (suggestion: SuggestedLink) => Promise<void>;
}

export function useSuggestionHandlers<T extends DetectedLink>({
  existingNormalizedUrlPlatforms,
  setLinks,
  insertLinkWithSectionOrdering,
  onLinkAdded,
  handleAcceptSuggestionFromHook,
  handleDismissSuggestionFromHook,
}: UseSuggestionHandlersProps<T>) {
  const handleAcceptSuggestionClick = useCallback(
    async (suggestion: SuggestedLink) => {
      const accepted = await handleAcceptSuggestionFromHook(suggestion);
      if (accepted) {
        const normalizedCategory = sectionOf(accepted as T);
        const nextLink = {
          ...(accepted as T),
          isVisible:
            (accepted as unknown as { isVisible?: boolean }).isVisible ?? true,
          state: (accepted as unknown as { state?: string }).state ?? 'active',
          platform: {
            ...(accepted as T).platform,
            category: normalizedCategory,
          },
        } as T;
        const normalizedUrl = (nextLink as DetectedLink).normalizedUrl;
        const platformId = (nextLink as DetectedLink).platform.id;
        const hasDuplicate = normalizedUrl
          ? (existingNormalizedUrlPlatforms
              .get(normalizedUrl)
              ?.has(platformId) ?? false)
          : false;
        if (!hasDuplicate) {
          setLinks(prev => insertLinkWithSectionOrdering(prev, nextLink));
        }
        onLinkAdded?.([nextLink]);
      }
    },
    [
      handleAcceptSuggestionFromHook,
      existingNormalizedUrlPlatforms,
      setLinks,
      insertLinkWithSectionOrdering,
      onLinkAdded,
    ]
  );

  const handleDismissSuggestionClick = useCallback(
    async (suggestion: SuggestedLink) => {
      await handleDismissSuggestionFromHook(suggestion);
    },
    [handleDismissSuggestionFromHook]
  );

  return {
    handleAcceptSuggestionClick,
    handleDismissSuggestionClick,
  };
}
