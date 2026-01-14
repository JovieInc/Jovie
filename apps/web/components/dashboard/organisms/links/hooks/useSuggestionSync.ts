/**
 * useSuggestionSync Hook
 *
 * Custom hook for syncing link suggestions from the server.
 * Uses TanStack Query for polling, version tracking, and caching.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type { ProfileSocialLink } from '@/app/app/dashboard/actions/social-links';
import { queryKeys, useSuggestionsQuery } from '@/lib/queries';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import type { LinkItem, SuggestedLink } from '../types';
import {
  areSuggestionListsEqual,
  convertDbLinksToLinkItems,
  convertDbLinksToSuggestions,
} from '../utils/link-transformers';

/**
 * Options for the useSuggestionSync hook
 */
export interface UseSuggestionSyncOptions {
  /** Profile ID to sync suggestions for */
  profileId: string | undefined;
  /** Whether suggestions feature is enabled */
  suggestionsEnabled: boolean;
  /** Auto-refresh deadline (ms timestamp) */
  autoRefreshUntilMs: number | null;
  /** Set auto-refresh deadline */
  setAutoRefreshUntilMs: React.Dispatch<React.SetStateAction<number | null>>;
  /** Current links version for optimistic locking */
  linksVersion: number;
  /** Set links version */
  setLinksVersion: React.Dispatch<React.SetStateAction<number>>;
  /** Set main links array */
  setLinks: React.Dispatch<React.SetStateAction<LinkItem[]>>;
  /** Set suggested links array */
  setSuggestedLinks: React.Dispatch<React.SetStateAction<SuggestedLink[]>>;
}

/**
 * Return type for the useSuggestionSync hook
 */
export interface UseSuggestionSyncReturn {
  /** Sync suggestions from server */
  syncSuggestionsFromServer: () => Promise<void>;
  /** Handle accepting a suggestion */
  handleAcceptSuggestion: (
    suggestion: DetectedLink & { suggestionId?: string }
  ) => Promise<LinkItem | null>;
  /** Handle dismissing a suggestion */
  handleDismissSuggestion: (
    suggestion: DetectedLink & { suggestionId?: string }
  ) => Promise<void>;
}

/**
 * Custom hook for syncing suggestions with the server
 *
 * Features:
 * - TanStack Query for automatic caching and polling
 * - Dynamic polling interval (faster during auto-refresh mode)
 * - Accept/dismiss API integration
 * - Version tracking for optimistic locking
 *
 * @example
 * ```tsx
 * const {
 *   syncSuggestionsFromServer,
 *   handleAcceptSuggestion,
 *   handleDismissSuggestion,
 * } = useSuggestionSync({
 *   profileId,
 *   suggestionsEnabled: true,
 *   autoRefreshUntilMs,
 *   setAutoRefreshUntilMs,
 *   linksVersion,
 *   setLinksVersion,
 *   setLinks,
 *   setSuggestedLinks,
 * });
 * ```
 */
export function useSuggestionSync({
  profileId,
  suggestionsEnabled,
  autoRefreshUntilMs,
  setAutoRefreshUntilMs,
  setLinksVersion,
  setLinks,
  setSuggestedLinks,
}: UseSuggestionSyncOptions): UseSuggestionSyncReturn {
  const queryClient = useQueryClient();

  // Polling interval depends on whether we're in auto-refresh mode
  const refetchInterval = useMemo(
    () => (autoRefreshUntilMs ? 2000 : 4500),
    [autoRefreshUntilMs]
  );

  // Use TanStack Query for fetching and polling suggestions
  const { data, refetch } = useSuggestionsQuery({
    profileId,
    enabled: suggestionsEnabled && !!profileId,
    refetchInterval,
  });

  // Process query data and update local state
  useEffect(() => {
    if (!data?.links) return;

    // Update version from server response
    if (data.maxVersion > 1) {
      setLinksVersion(prev => Math.max(prev, data.maxVersion));
    }

    // Update suggested links
    const nextSuggestions = convertDbLinksToSuggestions(
      data.links.filter(link => link.state === 'suggested')
    );
    setSuggestedLinks(prev =>
      areSuggestionListsEqual(prev, nextSuggestions) ? prev : nextSuggestions
    );
  }, [data, setLinksVersion, setSuggestedLinks]);

  // Check auto-refresh deadline and clear it when expired
  useEffect(() => {
    if (autoRefreshUntilMs && Date.now() >= autoRefreshUntilMs) {
      setAutoRefreshUntilMs(null);
    }
  }, [autoRefreshUntilMs, setAutoRefreshUntilMs, data]);

  // Manual sync function for immediate refresh
  const syncSuggestionsFromServer = useCallback(async () => {
    if (!profileId || !suggestionsEnabled) return;
    await refetch();
  }, [profileId, suggestionsEnabled, refetch]);

  // Handle accepting a suggestion
  const handleAcceptSuggestion = useCallback(
    async (
      suggestion: DetectedLink & { suggestionId?: string }
    ): Promise<LinkItem | null> => {
      if (!profileId) {
        toast.error('Missing profile id; please refresh and try again.');
        return null;
      }

      try {
        const suggestionId = suggestion.suggestionId;
        if (!suggestionId) {
          return null;
        }

        const response = await fetch('/api/dashboard/social-links', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId,
            linkId: suggestionId,
            action: 'accept',
          }),
        });

        if (!response.ok) {
          const errorData = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(errorData?.error || 'Failed to accept link');
        }

        const responseData = (await response.json()) as {
          link?: ProfileSocialLink;
        };

        if (responseData.link) {
          const [detected] = convertDbLinksToLinkItems([responseData.link]);
          setSuggestedLinks(prev =>
            prev.filter(s => s.suggestionId !== suggestionId)
          );
          if (detected) {
            setLinks(prev => [...prev, detected]);
          }
          // Invalidate the suggestions query to ensure fresh data
          queryClient.invalidateQueries({
            queryKey: queryKeys.suggestions.list(profileId),
          });
          toast.success('Link added to your list');
          return detected ?? null;
        }
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to accept link'
        );
      }
      return null;
    },
    [profileId, setLinks, setSuggestedLinks, queryClient]
  );

  // Handle dismissing a suggestion
  const handleDismissSuggestion = useCallback(
    async (
      suggestion: DetectedLink & { suggestionId?: string }
    ): Promise<void> => {
      if (!profileId) {
        toast.error('Missing profile id; please refresh and try again.');
        return;
      }

      if (!suggestion.suggestionId) {
        return;
      }

      try {
        const response = await fetch('/api/dashboard/social-links', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId,
            linkId: suggestion.suggestionId,
            action: 'dismiss',
          }),
        });

        if (!response.ok) {
          const errorData = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(errorData?.error || 'Failed to dismiss link');
        }

        setSuggestedLinks(prev =>
          prev.filter(s => s.suggestionId !== suggestion.suggestionId)
        );
        // Invalidate the suggestions query to ensure fresh data
        queryClient.invalidateQueries({
          queryKey: queryKeys.suggestions.list(profileId),
        });
        toast.success('Suggestion dismissed');
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to dismiss link'
        );
      }
    },
    [profileId, setSuggestedLinks, queryClient]
  );

  return {
    syncSuggestionsFromServer,
    handleAcceptSuggestion,
    handleDismissSuggestion,
  };
}
