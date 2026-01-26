'use client';

/**
 * Hook for smart sorting of UTM presets based on usage patterns
 *
 * Combines frequency, recency, and default popularity to provide
 * intelligent ordering of presets for the best user experience.
 */

import { useMemo } from 'react';
import type { UTMPreset, UTMPresetCategory, UTMSortOption } from '../types';
import { useUTMPresetRanking } from './useUTMUsageTracking';

export interface UseUTMSmartSortOptions {
  /** Categories to sort */
  categories: UTMPresetCategory[];
  /** Maximum number of presets to show in "recent" section */
  maxRecent?: number;
  /** Maximum number of presets to show in "popular" section */
  maxPopular?: number;
  /** Sort mode */
  sortMode?: UTMSortOption;
}

export interface SmartSortedPresets {
  /** Recently used presets (last 24 hours) */
  recent: UTMPreset[];
  /** Popular presets based on usage patterns */
  popular: UTMPreset[];
  /** All categories with their presets (excluding those in recent/popular) */
  categories: Array<{
    category: UTMPresetCategory;
    presets: UTMPreset[];
  }>;
  /** Flat list of all presets in smart order */
  allSorted: UTMPreset[];
  /** Whether there's any usage data */
  hasUsageData: boolean;
}

/**
 * Hook for smart sorting of UTM presets
 *
 * @example
 * ```tsx
 * const { recent, popular, categories } = useUTMSmartSort({
 *   categories: UTM_PRESET_CATEGORIES,
 *   maxRecent: 3,
 *   maxPopular: 5,
 * });
 * ```
 */
export function useUTMSmartSort({
  categories,
  maxRecent = 3,
  maxPopular = 5,
  sortMode = 'popular',
}: UseUTMSmartSortOptions): SmartSortedPresets {
  const { recentPresetIds, popularPresetIds } = useUTMPresetRanking();

  return useMemo(() => {
    // Build preset lookup map
    const presetMap = new Map<string, UTMPreset>();
    for (const category of categories) {
      for (const preset of category.presets) {
        presetMap.set(preset.id, preset);
      }
    }

    // Get recent presets
    const recent = recentPresetIds
      .slice(0, maxRecent)
      .map(id => presetMap.get(id))
      .filter((p): p is UTMPreset => p !== undefined);

    // Get popular presets (exclude those in recent)
    const recentSet = new Set(recent.map(p => p.id));
    const popular = popularPresetIds
      .filter(id => !recentSet.has(id))
      .slice(0, maxPopular)
      .map(id => presetMap.get(id))
      .filter((p): p is UTMPreset => p !== undefined);

    // Build categories excluding recent and popular
    const usedIds = new Set([
      ...recent.map(p => p.id),
      ...popular.map(p => p.id),
    ]);

    const sortedCategories = categories.map(category => ({
      category,
      presets: category.presets.filter(preset => !usedIds.has(preset.id)),
    }));

    // Build flat sorted list based on sort mode
    let allSorted: UTMPreset[];

    switch (sortMode) {
      case 'recent': {
        // Recent first, then popular, then rest by category
        allSorted = [
          ...recent,
          ...popular,
          ...sortedCategories.flatMap(c => c.presets),
        ];
        break;
      }
      case 'alphabetical': {
        // Sort everything alphabetically
        allSorted = Array.from(presetMap.values()).sort((a, b) =>
          a.label.localeCompare(b.label)
        );
        break;
      }
      case 'popular':
      default: {
        // Popular first, then recent, then rest by category
        allSorted = [
          ...popular,
          ...recent,
          ...sortedCategories.flatMap(c => c.presets),
        ];
        break;
      }
    }

    return {
      recent,
      popular,
      categories: sortedCategories,
      allSorted,
      hasUsageData: recentPresetIds.length > 0 || popularPresetIds.length > 0,
    };
  }, [
    categories,
    recentPresetIds,
    popularPresetIds,
    maxRecent,
    maxPopular,
    sortMode,
  ]);
}

/**
 * Get default presets for first-time users (no usage data yet)
 * These are the most commonly used presets across all users
 */
export function getDefaultPopularPresets(
  categories: UTMPresetCategory[]
): UTMPreset[] {
  // Default popular presets based on industry knowledge
  const defaultPopularIds = [
    'instagram-story',
    'instagram-bio',
    'tiktok-bio',
    'twitter-post',
    'newsletter',
    'youtube-description',
    'facebook-post',
    'meta-ads',
  ];

  const presetMap = new Map<string, UTMPreset>();
  for (const category of categories) {
    for (const preset of category.presets) {
      presetMap.set(preset.id, preset);
    }
  }

  return defaultPopularIds
    .map(id => presetMap.get(id))
    .filter((p): p is UTMPreset => p !== undefined);
}

/**
 * Merge user's popular presets with default popular presets
 * Ensures new users still see useful suggestions
 */
export function mergeWithDefaults(
  userPopular: UTMPreset[],
  categories: UTMPresetCategory[],
  maxTotal = 8
): UTMPreset[] {
  if (userPopular.length >= maxTotal) {
    return userPopular.slice(0, maxTotal);
  }

  const defaults = getDefaultPopularPresets(categories);
  const userIds = new Set(userPopular.map(p => p.id));

  const additionalDefaults = defaults.filter(p => !userIds.has(p.id));

  return [...userPopular, ...additionalDefaults].slice(0, maxTotal);
}
