import { useCallback } from 'react';
import {
  canonicalIdentity,
  type DetectedLink,
} from '@/lib/utils/platform-detection';
import type { SuggestedLink } from '../links/hooks';
import { sectionOf } from '../links/utils';

interface UseSuggestionHandlersProps<T extends DetectedLink> {
  links: T[];
  setLinks: React.Dispatch<React.SetStateAction<T[]>>;
  insertLinkWithSectionOrdering: (prev: T[], link: T) => T[];
  onLinkAdded?: (links: T[]) => void;
  handleAcceptSuggestionFromHook: (
    suggestion: SuggestedLink
  ) => Promise<DetectedLink | null>;
  handleDismissSuggestionFromHook: (suggestion: SuggestedLink) => Promise<void>;
}

export function useSuggestionHandlers<T extends DetectedLink>({
  links,
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
        const acceptedIdentity = canonicalIdentity({
          platform: (nextLink as DetectedLink).platform,
          normalizedUrl: (nextLink as DetectedLink).normalizedUrl,
        });
        const hasDuplicate = links.some(
          existing =>
            canonicalIdentity({
              platform: (existing as DetectedLink).platform,
              normalizedUrl: (existing as DetectedLink).normalizedUrl,
            }) === acceptedIdentity
        );
        if (!hasDuplicate) {
          setLinks(prev => insertLinkWithSectionOrdering(prev, nextLink));
        }
        onLinkAdded?.([nextLink]);
      }
    },
    [
      handleAcceptSuggestionFromHook,
      links,
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
