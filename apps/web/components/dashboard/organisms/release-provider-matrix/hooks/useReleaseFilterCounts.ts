'use client';

import { useMemo } from 'react';
import type { ReleaseType, ReleaseViewModel } from '@/lib/discography/types';

export interface ReleaseFilterCounts {
  /** Counts by release type */
  byType: Record<ReleaseType, number>;
  /** Counts by availability status */
  byAvailability: {
    all: number;
    complete: number;
    incomplete: number;
  };
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

    for (const release of releases) {
      // Count by type
      byType[release.releaseType]++;

      // Count by availability - check if all providers have URLs
      const hasAllProviders = release.providers.every(p => p.url);
      if (hasAllProviders) {
        complete++;
      } else {
        incomplete++;
      }
    }

    return {
      byType,
      byAvailability: {
        all: releases.length,
        complete,
        incomplete,
      },
    };
  }, [releases]);
}
