'use client';

import { useMemo } from 'react';
import type { ReleaseType, ReleaseViewModel } from '@/lib/discography/types';
import type { PopularityLevel } from '../ReleaseTableSubheader';

export interface ReleaseFilterCounts {
  /** Counts by release type */
  byType: Record<ReleaseType, number>;
  /** Counts by availability status */
  byAvailability: {
    all: number;
    complete: number;
    incomplete: number;
  };
  /** Counts by popularity level */
  byPopularity: {
    low: number;
    med: number;
    high: number;
  };
  /** Unique labels with counts */
  byLabel: { label: string; count: number }[];
}

/**
 * Get popularity level from score (0-100)
 */
export function getPopularityLevel(
  popularity: number | null | undefined
): PopularityLevel | null {
  if (popularity == null || !Number.isFinite(popularity)) return null;
  if (popularity <= 33) return 'low';
  if (popularity <= 66) return 'med';
  return 'high';
}

/**
 * Hook to compute filter option counts from releases array.
 * Used to display counts/badges next to filter options in the filter dropdown.
 */
export function useReleaseFilterCounts(
  releases: ReleaseViewModel[]
): ReleaseFilterCounts {
  return useMemo(() => {
    const byType: Record<ReleaseType, number> = {
      album: 0,
      ep: 0,
      single: 0,
      compilation: 0,
      live: 0,
      mixtape: 0,
      other: 0,
    };

    let complete = 0;
    let incomplete = 0;

    const byPopularity = {
      low: 0,
      med: 0,
      high: 0,
    };

    const labelCounts = new Map<string, number>();

    for (const release of releases) {
      // Count by type
      byType[release.releaseType]++;

      // Count by availability - check if all providers have URLs
      // Releases with no providers are considered incomplete
      const hasAllProviders =
        release.providers.length > 0 && release.providers.every(p => p.url);
      if (hasAllProviders) {
        complete++;
      } else {
        incomplete++;
      }

      // Count by popularity level
      const level = getPopularityLevel(release.spotifyPopularity);
      if (level) {
        byPopularity[level]++;
      }

      // Count by label
      if (release.label) {
        const current = labelCounts.get(release.label) || 0;
        labelCounts.set(release.label, current + 1);
      }
    }

    // Convert label map to sorted array
    const byLabel = Array.from(labelCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count); // Sort by count descending

    return {
      byType,
      byAvailability: {
        all: releases.length,
        complete,
        incomplete,
      },
      byPopularity,
      byLabel,
    };
  }, [releases]);
}
