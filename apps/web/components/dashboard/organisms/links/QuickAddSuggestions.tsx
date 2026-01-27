'use client';

import React, { useMemo } from 'react';
import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import {
  MUSIC_FIRST_ORDER,
  SOCIAL_FIRST_ORDER,
  SUGGESTION_PILLS,
  type SuggestionPillConfig,
} from './config';
import { buildPrefillUrl } from './utils';

/**
 * Props for the QuickAddSuggestions component
 */
export interface QuickAddSuggestionsProps {
  /**
   * Set of platform IDs that the user has already added.
   * These platforms will be filtered out of the suggestions.
   */
  existingPlatforms: Set<string>;

  /**
   * Whether the profile is music-focused.
   * When true, streaming platforms (Spotify, Apple Music) are prioritized.
   * When false, social platforms (Instagram, TikTok) are prioritized.
   */
  isMusicProfile?: boolean;

  /**
   * Callback when a platform is selected.
   * Receives the prefill URL for the selected platform.
   */
  onPlatformSelect: (prefillUrl: string) => void;

  /**
   * Optional additional CSS classes
   */
  className?: string;
}

/**
 * QuickAddSuggestions - Renders a row of quick-add platform buttons.
 *
 * This component displays suggestion pills for popular platforms that the user
 * hasn't added yet. Clicking a pill triggers the onPlatformSelect callback with
 * a prefill URL that can be used to populate a link input.
 *
 * The order of suggestions is based on the profile type:
 * - Music profiles: Streaming platforms first (Spotify, Apple Music, YouTube Music)
 * - Social profiles: Social platforms first (Instagram, TikTok, YouTube)
 *
 * @example
 * ```tsx
 * <QuickAddSuggestions
 *   existingPlatforms={new Set(['instagram', 'spotify'])}
 *   isMusicProfile={true}
 *   onPlatformSelect={(url) => setPrefillUrl(url)}
 * />
 * ```
 */
export const QuickAddSuggestions = React.memo(function QuickAddSuggestions({
  existingPlatforms,
  isMusicProfile = false,
  onPlatformSelect,
  className,
}: QuickAddSuggestionsProps) {
  /**
   * Filter and sort suggestion pills based on:
   * 1. Whether the platform is already added (exclude if so)
   * 2. Special case: YouTube Music is hidden if YouTube is already added
   * 3. Profile type ordering (music-first vs social-first)
   */
  const suggestionPills = useMemo(() => {
    const base = SUGGESTION_PILLS.filter((pill: SuggestionPillConfig) => {
      // Exclude platforms already added
      if (existingPlatforms.has(pill.id)) return false;
      // Hide YouTube Music if YouTube is already present
      if (pill.id === 'youtube-music' && existingPlatforms.has('youtube')) {
        return false;
      }
      return true;
    });

    // Determine ordering based on profile type
    const order = isMusicProfile ? MUSIC_FIRST_ORDER : SOCIAL_FIRST_ORDER;
    const rank = new Map<string, number>();
    order.forEach((id, index) => {
      rank.set(id, index);
    });

    // Sort by rank (unknown platforms go to the end)
    return base
      .slice()
      .sort(
        (a, b) =>
          (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
  }, [existingPlatforms, isMusicProfile]);

  // Don't render if there are no suggestions
  if (suggestionPills.length === 0) {
    return null;
  }

  return (
    <section
      aria-label='Quick link suggestions'
      className={`relative ${className ?? ''}`}
      data-testid='quick-add-suggestions'
    >
      {/* Left fade gradient */}
      <div className='pointer-events-none absolute left-0 top-0 z-10 h-full w-4 bg-linear-to-r from-(--color-bg-surface-0) to-transparent' />

      {/* Scrollable container */}
      <div className='flex items-center gap-2 overflow-x-auto scrollbar-hide px-1'>
        {suggestionPills.map(pill => (
          <PlatformPill
            key={pill.id}
            platformIcon={pill.simpleIconId}
            platformName={pill.label}
            primaryText={pill.label}
            suffix='+'
            tone='faded'
            onClick={() => onPlatformSelect(buildPrefillUrl(pill.id))}
            className='whitespace-nowrap shrink-0'
          />
        ))}
      </div>

      {/* Right fade gradient */}
      <div className='pointer-events-none absolute right-0 top-0 z-10 h-full w-4 bg-linear-to-l from-(--color-bg-surface-0) to-transparent' />
    </section>
  );
});

QuickAddSuggestions.displayName = 'QuickAddSuggestions';
