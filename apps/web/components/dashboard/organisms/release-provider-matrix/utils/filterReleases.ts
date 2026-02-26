import type { ReleaseViewModel } from '@/lib/discography/types';
import { getPopularityLevel } from '../hooks/useReleaseFilterCounts';
import type { ReleaseFilters } from '../ReleaseTableSubheader';

/**
 * Filter releases by text search query and structured filters.
 *
 * All filter dimensions are combined with AND logic:
 * - Text search matches against title (case-insensitive substring)
 * - Release type filter uses OR within the group (matches any selected type)
 * - Popularity filter uses OR within the group
 * - Label filter uses OR within the group
 *
 * Empty filter arrays are treated as "no filter" (all pass).
 */
export function filterReleases(
  releases: readonly ReleaseViewModel[],
  filters: ReleaseFilters,
  searchQuery: string
): ReleaseViewModel[] {
  return releases.filter(release => {
    // Text search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!release.title.toLowerCase().includes(query)) return false;
    }

    // Filter by release type
    if (
      filters.releaseTypes.length > 0 &&
      !filters.releaseTypes.includes(release.releaseType)
    ) {
      return false;
    }

    // Filter by popularity level
    if (filters.popularity.length > 0) {
      const level = getPopularityLevel(release.spotifyPopularity);
      if (!level || !filters.popularity.includes(level)) return false;
    }

    // Filter by label
    if (filters.labels.length > 0) {
      if (!release.label || !filters.labels.includes(release.label))
        return false;
    }

    return true;
  });
}
