'use client';

import { Plus, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef } from 'react';
import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import { track } from '@/lib/analytics';
import type { SuggestedLink } from './hooks/useSuggestions';
import { compactUrlDisplay, suggestionIdentity } from './utils';

// Re-export SuggestedLink for convenience
export type { SuggestedLink } from './hooks/useSuggestions';

/**
 * Props for the IngestedSuggestions component
 */
export interface IngestedSuggestionsProps {
  /**
   * Array of pending suggestions to display.
   * These are AI-discovered links that the user can accept or dismiss.
   */
  suggestions: SuggestedLink[];

  /**
   * Callback when a suggestion is accepted.
   * The component will remove the suggestion from the list after this callback completes.
   */
  onAccept: (suggestion: SuggestedLink) => void | Promise<void>;

  /**
   * Callback when a suggestion is dismissed.
   * The component will remove the suggestion from the list after this callback completes.
   */
  onDismiss: (suggestion: SuggestedLink) => void | Promise<void>;

  /**
   * Profile ID for analytics tracking (optional).
   */
  profileId?: string;

  /**
   * Function to generate a unique key for each suggestion.
   * Defaults to using suggestionId or platform::normalizedUrl combo.
   */
  suggestionKey?: (suggestion: SuggestedLink) => string;

  /**
   * Optional additional CSS classes
   */
  className?: string;
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
 * Default suggestion key generator
 */
function defaultSuggestionKey(suggestion: SuggestedLink): string {
  return (
    suggestion.suggestionId ||
    `${suggestion.platform.id}::${suggestion.normalizedUrl}`
  );
}

/**
 * IngestedSuggestions - Displays AI-discovered link suggestions with accept/dismiss actions.
 *
 * This component renders a row of pending suggestions that were automatically
 * discovered by AI from external sources (e.g., other social profiles, linktrees).
 * Users can accept suggestions to add them to their links, or dismiss them.
 *
 * Features:
 * - Renders PlatformPill for each suggestion with "Suggested" badge
 * - Click pill to accept, X button to dismiss
 * - Analytics tracking for surfaced/accepted/dismissed events
 * - Memoized for performance
 *
 * @example
 * ```tsx
 * <IngestedSuggestions
 *   suggestions={pendingSuggestions}
 *   onAccept={(s) => handleAcceptSuggestion(s)}
 *   onDismiss={(s) => handleDismissSuggestion(s)}
 *   profileId={profileId}
 * />
 * ```
 */
export const IngestedSuggestions = React.memo(function IngestedSuggestions({
  suggestions,
  onAccept,
  onDismiss,
  profileId,
  suggestionKey = defaultSuggestionKey,
  className,
}: IngestedSuggestionsProps) {
  // Track which suggestions have already been surfaced to avoid duplicate events
  const surfacedKeysRef = useRef<Set<string>>(new Set());

  // Track when suggestions are surfaced to the user
  useEffect(() => {
    if (suggestions.length === 0) return;

    suggestions.forEach(suggestion => {
      const key = suggestionKey(suggestion);
      if (surfacedKeysRef.current.has(key)) return;

      surfacedKeysRef.current.add(key);
      void track(
        'link_suggestion_surfaced',
        buildSuggestionEventProperties(suggestion, profileId)
      );
    });
  }, [suggestions, profileId, suggestionKey]);

  /**
   * Build the secondary text (identity) for a suggestion.
   * Returns @-prefixed handle if available.
   */
  const buildSecondaryText = useCallback(
    (suggestion: SuggestedLink): string | undefined => {
      return suggestionIdentity(suggestion);
    },
    []
  );

  /**
   * Handle accepting a suggestion with analytics tracking
   */
  const handleAccept = useCallback(
    (suggestion: SuggestedLink) => {
      // Track acceptance with detailed properties
      void track('dashboard_link_suggestion_accept', {
        platform: suggestion.platform.id,
        sourcePlatform: suggestion.sourcePlatform ?? undefined,
        sourceType: suggestion.sourceType ?? undefined,
        confidence: suggestion.confidence ?? undefined,
        hasIdentity: Boolean(suggestionIdentity(suggestion)),
      });

      // Call the parent handler
      const result = onAccept(suggestion);

      // Also track the post-acceptance event
      if (result instanceof Promise) {
        void result.then(() => {
          void track(
            'link_suggestion_accepted',
            buildSuggestionEventProperties(suggestion, profileId)
          );
        });
      } else {
        void track(
          'link_suggestion_accepted',
          buildSuggestionEventProperties(suggestion, profileId)
        );
      }
    },
    [onAccept, profileId]
  );

  /**
   * Handle dismissing a suggestion with analytics tracking
   */
  const handleDismiss = useCallback(
    (suggestion: SuggestedLink, event: React.MouseEvent) => {
      // Stop propagation to prevent triggering the accept click
      event.stopPropagation();

      // Track dismissal with detailed properties
      void track('dashboard_link_suggestion_dismiss', {
        platform: suggestion.platform.id,
        sourcePlatform: suggestion.sourcePlatform ?? undefined,
        sourceType: suggestion.sourceType ?? undefined,
        confidence: suggestion.confidence ?? undefined,
        hasIdentity: Boolean(suggestionIdentity(suggestion)),
      });

      // Call the parent handler
      const result = onDismiss(suggestion);

      // Also track the post-dismissal event
      if (result instanceof Promise) {
        void result.then(() => {
          void track(
            'link_suggestion_dismissed',
            buildSuggestionEventProperties(suggestion, profileId)
          );
        });
      } else {
        void track(
          'link_suggestion_dismissed',
          buildSuggestionEventProperties(suggestion, profileId)
        );
      }
    },
    [onDismiss, profileId]
  );

  // Don't render if there are no suggestions
  if (suggestions.length === 0) {
    return null;
  }

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label needed for accessibility
    <div
      className={`rounded-2xl border border-subtle bg-surface-1/60 px-3 py-2.5 shadow-sm shadow-black/5 ${className ?? ''}`}
      aria-label='Ingested link suggestions'
    >
      <div className='flex flex-wrap items-center justify-center gap-2'>
        {suggestions.map(suggestion => {
          const key = suggestionKey(suggestion);
          const identity =
            buildSecondaryText(suggestion) ||
            compactUrlDisplay(suggestion.platform.id, suggestion.normalizedUrl);
          const pillText = identity
            ? `${suggestion.platform.name} • ${identity}`
            : suggestion.platform.name;

          return (
            <PlatformPill
              key={key}
              platformIcon={suggestion.platform.icon}
              platformName={suggestion.platform.name}
              primaryText={pillText}
              badgeText='Suggested'
              state='ready'
              suffix={<Plus className='h-3.5 w-3.5' aria-hidden />}
              trailing={
                <button
                  type='button'
                  aria-label={`Dismiss ${suggestion.platform.name} suggestion`}
                  className='grid h-6 w-6 place-items-center rounded-full border border-subtle bg-surface-1 text-secondary-token transition hover:bg-surface-2 hover:text-primary-token'
                  onClick={event => handleDismiss(suggestion, event)}
                >
                  <X className='h-3.5 w-3.5' aria-hidden />
                </button>
              }
              onClick={() => handleAccept(suggestion)}
              className='pr-1.5'
              testId='ingested-suggestion-pill'
            />
          );
        })}
      </div>
    </div>
  );
});

IngestedSuggestions.displayName = 'IngestedSuggestions';
