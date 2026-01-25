'use client';

/**
 * Hook for searching and filtering UTM presets with instant local filtering.
 *
 * Since presets are local data, no debouncing is needed for the filter operation.
 * Results update synchronously as the user types.
 */

import { useDeferredValue, useMemo, useState } from 'react';
import type { UTMPreset, UTMPresetCategory } from '../types';

export interface UseUTMPresetSearchOptions {
  /** Categories to search within */
  categories: UTMPresetCategory[];
  /** Recently used preset IDs (shown at top) */
  recentPresetIds?: string[];
  /** Popular preset IDs (shown after recent) */
  popularPresetIds?: string[];
}

export interface UTMPresetSearchResult {
  /** Matched presets from recent usage */
  recent: UTMPreset[];
  /** Matched presets from popular usage */
  popular: UTMPreset[];
  /** All matched presets grouped by category */
  byCategory: Array<{
    category: UTMPresetCategory;
    presets: UTMPreset[];
  }>;
  /** Flat list of all matched presets */
  all: UTMPreset[];
  /** Whether any results were found */
  hasResults: boolean;
  /** Total number of matched presets */
  totalCount: number;
}

export interface UseUTMPresetSearchReturn {
  /** Current search query */
  query: string;
  /** Update the search query */
  setQuery: (query: string) => void;
  /** Clear the search query */
  clearQuery: () => void;
  /** Filtered and organized search results */
  results: UTMPresetSearchResult;
  /** Whether a search query is active */
  isSearching: boolean;
}

/**
 * Normalize a string for search comparison
 */
function normalizeForSearch(text: string): string {
  return text.toLowerCase().trim();
}

/**
 * Check if a preset matches the search query
 */
function presetMatchesQuery(
  preset: UTMPreset,
  normalizedQuery: string
): boolean {
  // Search in label
  if (normalizeForSearch(preset.label).includes(normalizedQuery)) {
    return true;
  }

  // Search in description
  if (
    preset.description &&
    normalizeForSearch(preset.description).includes(normalizedQuery)
  ) {
    return true;
  }

  // Search in UTM source
  if (normalizeForSearch(preset.params.utm_source).includes(normalizedQuery)) {
    return true;
  }

  // Search in UTM medium
  if (normalizeForSearch(preset.params.utm_medium).includes(normalizedQuery)) {
    return true;
  }

  // Search in UTM content
  if (
    preset.params.utm_content &&
    normalizeForSearch(preset.params.utm_content).includes(normalizedQuery)
  ) {
    return true;
  }

  return false;
}

/**
 * Hook for searching UTM presets with instant filtering
 *
 * @example
 * ```tsx
 * const { query, setQuery, results, isSearching } = useUTMPresetSearch({
 *   categories: UTM_PRESET_CATEGORIES,
 *   recentPresetIds: ['instagram-story', 'newsletter'],
 *   popularPresetIds: ['tiktok-bio', 'twitter-post'],
 * });
 * ```
 */
export function useUTMPresetSearch({
  categories,
  recentPresetIds = [],
  popularPresetIds = [],
}: UseUTMPresetSearchOptions): UseUTMPresetSearchReturn {
  const [query, setQuery] = useState('');

  // Use deferred value for smoother typing experience
  const deferredQuery = useDeferredValue(query);

  // Build preset lookup maps once
  const { presetMap, allPresets } = useMemo(() => {
    const map = new Map<string, UTMPreset>();
    const all: UTMPreset[] = [];

    for (const category of categories) {
      for (const preset of category.presets) {
        map.set(preset.id, preset);
        all.push(preset);
      }
    }

    return { presetMap: map, allPresets: all };
  }, [categories]);

  // Filter presets based on query
  const results = useMemo((): UTMPresetSearchResult => {
    const normalizedQuery = normalizeForSearch(deferredQuery);
    const isFiltering = normalizedQuery.length > 0;

    // Get all matching presets
    const matchingPresets = isFiltering
      ? allPresets.filter(preset => presetMatchesQuery(preset, normalizedQuery))
      : allPresets;

    const matchingIds = new Set(matchingPresets.map(p => p.id));

    // Filter recent presets
    const recent = recentPresetIds
      .filter(id => matchingIds.has(id))
      .map(id => presetMap.get(id))
      .filter((p): p is UTMPreset => p !== undefined)
      .slice(0, 3); // Max 3 recent items

    // Filter popular presets (exclude those already in recent)
    const recentSet = new Set(recent.map(p => p.id));
    const popular = popularPresetIds
      .filter(id => matchingIds.has(id) && !recentSet.has(id))
      .map(id => presetMap.get(id))
      .filter((p): p is UTMPreset => p !== undefined)
      .slice(0, 5); // Max 5 popular items

    // Group remaining by category (exclude recent and popular)
    const usedIds = new Set([
      ...recent.map(p => p.id),
      ...popular.map(p => p.id),
    ]);
    const byCategory = categories
      .map(category => ({
        category,
        presets: category.presets.filter(
          preset => matchingIds.has(preset.id) && !usedIds.has(preset.id)
        ),
      }))
      .filter(group => group.presets.length > 0);

    return {
      recent,
      popular,
      byCategory,
      all: matchingPresets,
      hasResults: matchingPresets.length > 0,
      totalCount: matchingPresets.length,
    };
  }, [
    deferredQuery,
    allPresets,
    categories,
    presetMap,
    recentPresetIds,
    popularPresetIds,
  ]);

  const clearQuery = () => setQuery('');

  return {
    query,
    setQuery,
    clearQuery,
    results,
    isSearching: query.length > 0,
  };
}

/**
 * Simple hook for filtering a flat list of presets
 * Useful for single-category filtering
 */
export function usePresetFilter(presets: UTMPreset[]): {
  query: string;
  setQuery: (query: string) => void;
  filtered: UTMPreset[];
  hasResults: boolean;
} {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeForSearch(deferredQuery);
    if (!normalizedQuery) return presets;
    return presets.filter(preset =>
      presetMatchesQuery(preset, normalizedQuery)
    );
  }, [presets, deferredQuery]);

  return {
    query,
    setQuery,
    filtered,
    hasResults: filtered.length > 0,
  };
}
