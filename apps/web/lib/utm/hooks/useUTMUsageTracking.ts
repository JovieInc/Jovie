'use client';

/**
 * Hook for tracking UTM preset usage
 *
 * Provides functions to record usage and retrieve usage-based sorting data.
 * All data is stored locally in localStorage for privacy.
 */

import { useCallback, useEffect, useState } from 'react';
import { track } from '@/lib/analytics';
import {
  getPopularPresetIds,
  getRecentPresetIds,
  loadUsageData,
  recordPresetUsage,
} from '../storage';
import type { UTMUsageData } from '../types';

export interface UseUTMUsageTrackingOptions {
  /** Context ID for grouping usage (e.g., release ID) */
  contextId?: string;
  /** Whether to send analytics events */
  enableAnalytics?: boolean;
}

export interface UseUTMUsageTrackingReturn {
  /** Record that a preset was used */
  trackPresetUsage: (presetId: string, metadata?: UTMTrackingMetadata) => void;
  /** Get recently used preset IDs */
  recentPresetIds: string[];
  /** Get popular preset IDs */
  popularPresetIds: string[];
  /** Refresh usage data from storage */
  refreshUsageData: () => void;
  /** Full usage data (for debugging) */
  usageData: UTMUsageData | null;
}

export interface UTMTrackingMetadata {
  /** Category of the preset */
  category?: string;
  /** Whether user found this via search */
  wasSearched?: boolean;
  /** Position in the list where item was clicked */
  position?: number;
  /** Time (ms) from dropdown open to selection */
  timeToSelect?: number;
}

/**
 * Hook for tracking and using UTM preset usage patterns
 *
 * @example
 * ```tsx
 * const { trackPresetUsage, recentPresetIds, popularPresetIds } = useUTMUsageTracking({
 *   contextId: release.id,
 *   enableAnalytics: true,
 * });
 *
 * // When user selects a preset
 * trackPresetUsage('instagram-story', { category: 'social', position: 0 });
 * ```
 */
export function useUTMUsageTracking({
  contextId,
  enableAnalytics = true,
}: UseUTMUsageTrackingOptions = {}): UseUTMUsageTrackingReturn {
  const [usageData, setUsageData] = useState<UTMUsageData | null>(null);
  const [recentPresetIds, setRecentPresetIds] = useState<string[]>([]);
  const [popularPresetIds, setPopularPresetIds] = useState<string[]>([]);

  // Load initial data
  const refreshUsageData = useCallback(() => {
    const data = loadUsageData();
    setUsageData(data);
    setRecentPresetIds(getRecentPresetIds(5));
    setPopularPresetIds(getPopularPresetIds(5));
  }, []);

  // Load on mount
  useEffect(() => {
    refreshUsageData();
  }, [refreshUsageData]);

  // Track preset usage
  const trackPresetUsage = useCallback(
    (presetId: string, metadata?: UTMTrackingMetadata) => {
      // Record to local storage
      const updatedData = recordPresetUsage(presetId, contextId);
      setUsageData(updatedData);

      // Update derived state
      setRecentPresetIds(getRecentPresetIds(5));
      setPopularPresetIds(getPopularPresetIds(5));

      // Send analytics event
      if (enableAnalytics) {
        track('utm_preset_select', {
          presetId,
          category: metadata?.category,
          wasSearched: metadata?.wasSearched ?? false,
          position: metadata?.position ?? -1,
          timeToSelect: metadata?.timeToSelect ?? -1,
          contextId,
        });
      }
    },
    [contextId, enableAnalytics]
  );

  return {
    trackPresetUsage,
    recentPresetIds,
    popularPresetIds,
    refreshUsageData,
    usageData,
  };
}

/**
 * Simpler hook that just provides recent/popular IDs without tracking
 * Useful for components that only need to read, not write
 */
export function useUTMPresetRanking(): {
  recentPresetIds: string[];
  popularPresetIds: string[];
  refresh: () => void;
} {
  const [recentPresetIds, setRecentPresetIds] = useState<string[]>([]);
  const [popularPresetIds, setPopularPresetIds] = useState<string[]>([]);

  const refresh = useCallback(() => {
    setRecentPresetIds(getRecentPresetIds(5));
    setPopularPresetIds(getPopularPresetIds(5));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    recentPresetIds,
    popularPresetIds,
    refresh,
  };
}
