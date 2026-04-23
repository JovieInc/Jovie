'use client';

import { useMemo } from 'react';
import type {
  EntityProvider,
  EntityRef,
  EntitySearchResult,
} from '@/lib/commands/entities';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import { EntityChip } from './EntityChip';

interface ReleaseLike {
  readonly id: string;
  readonly title: string;
  readonly artworkUrl?: string | null;
  readonly artistNames?: readonly string[];
}

function releaseMatches(release: ReleaseLike, lowerQuery: string): boolean {
  if (!lowerQuery) return true;
  if (release.title.toLowerCase().includes(lowerQuery)) return true;
  return (release.artistNames ?? []).some(n =>
    n.toLowerCase().includes(lowerQuery)
  );
}

function toEntityRef(release: ReleaseLike): EntityRef {
  return {
    kind: 'release',
    id: release.id,
    label: release.title,
    thumbnail: release.artworkUrl ?? undefined,
  };
}

/**
 * Build an EntityProvider for releases scoped to a given profile.
 *
 * Releases are pre-loaded (not server-searched) — the creator's full catalog
 * rarely exceeds a few hundred rows, so a local substring filter is simpler
 * than hitting an API per keystroke. The slash menu already has typeahead
 * latency built in via React; we don't need to debounce over the wire.
 */
export function createReleaseProvider(profileId: string): EntityProvider {
  return {
    kind: 'release',
    label: 'Releases',
    useSearch(query: string): EntitySearchResult {
      const { data, isLoading } = useReleasesQuery(profileId);
      return useMemo(() => {
        const lowerQuery = query.toLowerCase();
        const items = (data ?? [])
          .filter(r => releaseMatches(r, lowerQuery))
          .slice(0, 8)
          .map(toEntityRef);
        return { items, isLoading };
      }, [data, isLoading, query]);
    },
    renderChip(ref) {
      return <EntityChip data={ref} variant='input' isInputChip />;
    },
  };
}
