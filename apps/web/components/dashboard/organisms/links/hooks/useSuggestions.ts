/**
 * useSuggestions Hook
 *
 * Custom hook for managing AI-ingested link suggestions state.
 * Handles pending suggestions, surfaced tracking, and accept/dismiss with analytics.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { trimTrailingSlashes } from '@/lib/utils/string-utils';

/**
 * Extended suggestion link type with additional metadata for AI-ingested suggestions
 */
export interface SuggestedLink extends DetectedLink {
  /** Unique identifier for the suggestion */
  suggestionId?: string;
  /** Current state of the suggestion */
  state?: 'active' | 'suggested' | 'rejected';
  /** AI confidence score (0-1) */
  confidence?: number | null;
  /** Platform where this link was discovered */
  sourcePlatform?: string | null;
  /** Type of source (e.g., 'bio', 'post', 'linktree') */
  sourceType?: string | null;
  /** Evidence supporting this suggestion */
  evidence?: { sources?: string[]; signals?: string[] } | null;
}

/**
 * Options for the useSuggestions hook
 */
export interface UseSuggestionsOptions<
  T extends SuggestedLink = SuggestedLink,
> {
  /** Initial/external suggested links from props */
  suggestedLinks: T[];
  /** Whether suggestion features are enabled */
  suggestionsEnabled?: boolean;
  /** Profile ID for analytics tracking */
  profileId?: string;
  /** Callback when a suggestion is accepted - returns the accepted link or null */
  onAcceptSuggestion?: (
    suggestion: T
  ) => Promise<DetectedLink | null> | DetectedLink | null | void;
  /** Callback when a suggestion is dismissed */
  onDismissSuggestion?: (suggestion: T) => Promise<void> | void;
}

/**
 * Return type for the useSuggestions hook
 */
export interface UseSuggestionsReturn<T extends SuggestedLink = SuggestedLink> {
  /** Current pending suggestions that haven't been accepted or dismissed */
  pendingSuggestions: T[];
  /** Set pending suggestions directly (for manual manipulation) */
  setPendingSuggestions: React.Dispatch<React.SetStateAction<T[]>>;
  /** Handle accepting a suggestion with analytics tracking */
  handleAccept: (suggestion: T) => Promise<DetectedLink | null>;
  /** Handle dismissing a suggestion with analytics tracking */
  handleDismiss: (suggestion: T) => Promise<void>;
  /** Generate a unique key for a suggestion (for React keys and deduplication) */
  suggestionKey: (suggestion: T) => string;
  /** Whether suggestions are enabled and there are pending suggestions */
  hasPendingSuggestions: boolean;
}

/**
 * Build analytics event properties for a suggestion
 */
function buildSuggestionEventProperties(
  suggestion: SuggestedLink,
  profileId?: string
) {
  const confidenceValue =
    typeof suggestion.confidence === 'number' ? suggestion.confidence : null;

  return {
    platformId: suggestion.platform.id,
    sourcePlatform: suggestion.sourcePlatform ?? null,
    sourceType: suggestion.sourceType ?? null,
    confidence: confidenceValue,
    profileId: profileId ?? null,
  };
}

/**
 * Extract an @-prefixed identity from a suggestion's normalized URL
 */
function getSuggestionIdentity(
  suggestion: Pick<DetectedLink, 'platform' | 'normalizedUrl'>
): string | undefined {
  const url = suggestion.normalizedUrl || '';
  if (!url) return undefined;

  // Simple extraction - look for @-prefixed segments or path segments
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const path = trimTrailingSlashes(parsed.pathname);
    const segments = path.split('/').filter(Boolean);
    const first = segments[0] ?? '';

    if (first.startsWith('@')) {
      return first;
    }

    // For certain platforms, extract the first path segment as identity
    const handlePlatforms = ['instagram', 'twitter', 'x', 'tiktok', 'venmo'];
    if (handlePlatforms.includes(suggestion.platform.id) && first) {
      return `@${first}`;
    }
  } catch {
    // URL parsing failed
  }

  return undefined;
}

/**
 * Custom hook for managing AI-ingested link suggestions.
 *
 * Features:
 * - Syncs with external suggestedLinks prop
 * - Tracks "surfaced" analytics when suggestions are shown
 * - Handles accept/dismiss with full analytics tracking
 * - Removes suggestions from pending list after action
 *
 * @example
 * ```tsx
 * const {
 *   pendingSuggestions,
 *   handleAccept,
 *   handleDismiss,
 *   hasPendingSuggestions,
 * } = useSuggestions({
 *   suggestedLinks: profileSuggestions,
 *   suggestionsEnabled: true,
 *   profileId: profile.id,
 *   onAcceptSuggestion: async (s) => {
 *     const accepted = await api.acceptSuggestion(s);
 *     return accepted;
 *   },
 *   onDismissSuggestion: async (s) => {
 *     await api.dismissSuggestion(s);
 *   },
 * });
 * ```
 */
export function useSuggestions<T extends SuggestedLink = SuggestedLink>({
  suggestedLinks,
  suggestionsEnabled = false,
  profileId,
  onAcceptSuggestion,
  onDismissSuggestion,
}: UseSuggestionsOptions<T>): UseSuggestionsReturn<T> {
  // Internal state for pending suggestions
  const [pendingSuggestions, setPendingSuggestions] = useState<T[]>(
    () => suggestedLinks
  );

  /**
   * Generate a unique key for a suggestion (for React keys and deduplication)
   */
  const suggestionKey = useCallback(
    (s: T): string => s.suggestionId || `${s.platform.id}::${s.normalizedUrl}`,
    []
  );

  /**
   * Memoize signature calculation to detect when suggestedLinks actually changes.
   * Use sorted keys to ensure stable comparison regardless of array order.
   */
  const suggestedLinksSignature = useMemo(() => {
    const keys = suggestedLinks
      .map(s => suggestionKey(s))
      .sort((a, b) => a.localeCompare(b));
    return keys.join('|');
  }, [suggestedLinks, suggestionKey]);

  // Track the previous signature to detect actual changes
  const prevSuggestedLinksSignatureRef = useRef<string>(
    suggestedLinksSignature
  );

  // Track which suggestions have been surfaced to avoid duplicate analytics
  const surfacedSuggestionKeysRef = useRef<Set<string>>(new Set());

  /**
   * Sync pendingSuggestions when external suggestedLinks changes.
   * Only update if the signature actually changed to avoid unnecessary re-renders.
   */
  useEffect(() => {
    if (prevSuggestedLinksSignatureRef.current === suggestedLinksSignature) {
      return;
    }
    prevSuggestedLinksSignatureRef.current = suggestedLinksSignature;
    setPendingSuggestions(suggestedLinks);
  }, [suggestedLinks, suggestedLinksSignature]);

  /**
   * Track "surfaced" analytics when suggestions are shown to the user.
   * Each suggestion is only tracked once per session.
   */
  useEffect(() => {
    if (!suggestionsEnabled || pendingSuggestions.length === 0) {
      return;
    }

    pendingSuggestions.forEach(suggestion => {
      const key = suggestionKey(suggestion);
      if (surfacedSuggestionKeysRef.current.has(key)) {
        return;
      }
      surfacedSuggestionKeysRef.current.add(key);
      void track(
        'link_suggestion_surfaced',
        buildSuggestionEventProperties(suggestion, profileId)
      );
    });
  }, [pendingSuggestions, profileId, suggestionKey, suggestionsEnabled]);

  /**
   * Handle accepting a suggestion with full analytics tracking.
   * Removes the suggestion from pending list and returns the accepted link.
   */
  const handleAccept = useCallback(
    async (suggestion: T): Promise<DetectedLink | null> => {
      // Track acceptance initiation with detailed properties
      void track('dashboard_link_suggestion_accept', {
        platform: suggestion.platform.id,
        sourcePlatform: suggestion.sourcePlatform ?? undefined,
        sourceType: suggestion.sourceType ?? undefined,
        confidence: suggestion.confidence ?? undefined,
        hasIdentity: Boolean(getSuggestionIdentity(suggestion)),
      });

      // Call the parent handler if provided
      let accepted: DetectedLink | null = null;
      if (onAcceptSuggestion) {
        const result = await onAcceptSuggestion(suggestion);
        accepted = result ?? null;
      }

      // Remove from pending suggestions
      setPendingSuggestions(prev =>
        prev.filter(s => suggestionKey(s) !== suggestionKey(suggestion))
      );

      // Track successful acceptance
      if (accepted) {
        void track(
          'link_suggestion_accepted',
          buildSuggestionEventProperties(suggestion, profileId)
        );
      }

      return accepted;
    },
    [onAcceptSuggestion, profileId, suggestionKey]
  );

  /**
   * Handle dismissing a suggestion with full analytics tracking.
   * Removes the suggestion from pending list.
   */
  const handleDismiss = useCallback(
    async (suggestion: T): Promise<void> => {
      // Track dismissal initiation with detailed properties
      void track('dashboard_link_suggestion_dismiss', {
        platform: suggestion.platform.id,
        sourcePlatform: suggestion.sourcePlatform ?? undefined,
        sourceType: suggestion.sourceType ?? undefined,
        confidence: suggestion.confidence ?? undefined,
        hasIdentity: Boolean(getSuggestionIdentity(suggestion)),
      });

      // Call the parent handler if provided
      if (onDismissSuggestion) {
        await onDismissSuggestion(suggestion);
      }

      // Remove from pending suggestions
      setPendingSuggestions(prev =>
        prev.filter(s => suggestionKey(s) !== suggestionKey(suggestion))
      );

      // Track successful dismissal
      void track(
        'link_suggestion_dismissed',
        buildSuggestionEventProperties(suggestion, profileId)
      );
    },
    [onDismissSuggestion, profileId, suggestionKey]
  );

  /**
   * Computed value indicating if there are actionable suggestions
   */
  const hasPendingSuggestions =
    suggestionsEnabled && pendingSuggestions.length > 0;

  return {
    pendingSuggestions,
    setPendingSuggestions,
    handleAccept,
    handleDismiss,
    suggestionKey,
    hasPendingSuggestions,
  };
}
