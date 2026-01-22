/**
 * useSuggestionSync Hook
 *
 * Custom hook for syncing link suggestions from the server.
 * Uses TanStack Query for polling, version tracking, caching, and mutations.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
  useAcceptSuggestionMutation,
  useDismissSuggestionMutation,
  useSuggestionsQuery,
} from '@/lib/queries';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import type { LinkItem, SuggestedLink } from '../types';
import {
  areSuggestionListsEqual,
  convertDbLinksToLinkItems,
  convertDbLinksToSuggestions,
} from '../utils/link-transformers';

type AcceptSuggestionResponse = ReturnType<
  ReturnType<typeof useAcceptSuggestionMutation>['mutateAsync']
>;

function convertAcceptedLinkToLinkItem(
  data: Awaited<AcceptSuggestionResponse>
): LinkItem | null {
  if (!data.link) return null;

  // Add default values for required ProfileSocialLink fields
  const linkWithDefaults = {
    ...data.link,
    sortOrder: data.link.sortOrder ?? 0,
    isActive: data.link.isActive ?? true,
    state: (data.link.state as 'active' | 'suggested' | 'rejected') ?? 'active',
  };

  const [detected] = convertDbLinksToLinkItems([linkWithDefaults]);
  return detected ?? null;
}

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
  /** Whether the preview sidebar is open. Pauses polling when true. */
  sidebarOpen?: boolean;
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
  sidebarOpen = false,
}: UseSuggestionSyncOptions): UseSuggestionSyncReturn {
  // Polling interval depends on auto-refresh mode and sidebar state
  // Pause polling when sidebar is open to reduce unnecessary requests
  const refetchInterval = useMemo(
    () => (sidebarOpen ? false : autoRefreshUntilMs ? 2000 : 4500),
    [autoRefreshUntilMs, sidebarOpen]
  );

  // Use TanStack Query for fetching and polling suggestions
  // Query stays enabled but polling pauses when sidebar is open
  const { data, refetch } = useSuggestionsQuery({
    profileId,
    enabled: suggestionsEnabled && !!profileId,
    refetchInterval,
  });

  // Use mutation hooks for accept/dismiss actions
  // These handle toasts and cache invalidation automatically
  const acceptMutation = useAcceptSuggestionMutation(profileId);
  const dismissMutation = useDismissSuggestionMutation(profileId);

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

  // Handle accepting a suggestion using the mutation hook
  const handleAcceptSuggestion = useCallback(
    async (
      suggestion: DetectedLink & { suggestionId?: string }
    ): Promise<LinkItem | null> => {
      if (!profileId) {
        toast.error('Missing profile id; please refresh and try again.');
        return null;
      }

      const suggestionId = suggestion.suggestionId;
      if (!suggestionId) {
        return null;
      }

      try {
        const data = await acceptMutation.mutateAsync({
          profileId,
          linkId: suggestionId,
        });

        if (!data.link) return null;

        const detected = convertAcceptedLinkToLinkItem(data);
        setSuggestedLinks(prev =>
          prev.filter(s => s.suggestionId !== suggestionId)
        );
        if (detected) {
          setLinks(prev => [...prev, detected]);
        }
        return detected;
      } catch {
        return null;
      }
    },
    [profileId, acceptMutation, setLinks, setSuggestedLinks]
  );

  // Handle dismissing a suggestion using the mutation hook
  const handleDismissSuggestion = useCallback(
    async (
      suggestion: DetectedLink & { suggestionId?: string }
    ): Promise<void> => {
      if (!profileId) {
        toast.error('Missing profile id; please refresh and try again.');
        return;
      }

      const suggestionId = suggestion.suggestionId;
      if (!suggestionId) return;

      try {
        await dismissMutation.mutateAsync({ profileId, linkId: suggestionId });
        setSuggestedLinks(prev =>
          prev.filter(s => s.suggestionId !== suggestionId)
        );
      } catch {
        // Errors/toasts are handled by the mutation hook.
      }
    },
    [profileId, dismissMutation, setSuggestedLinks]
  );

  return {
    syncSuggestionsFromServer,
    handleAcceptSuggestion,
    handleDismissSuggestion,
  };
}
