'use client';

import { useMemo } from 'react';
import type {
  EntityProvider,
  EntityRef,
  EntitySearchResult,
} from '@/lib/commands/entities';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import { EntityChip } from './EntityChip';

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
        const items: EntityRef[] = (data ?? [])
          .filter(r => {
            if (!query) return true;
            const q = query.toLowerCase();
            return (
              r.title.toLowerCase().includes(q) ||
              (r.artistNames ?? []).some(n => n.toLowerCase().includes(q))
            );
          })
          .slice(0, 8)
          .map(r => ({
            kind: 'release',
            id: r.id,
            label: r.title,
            thumbnail: r.artworkUrl,
          }));
        return { items, isLoading };
      }, [data, isLoading, query]);
    },
    renderChip(ref) {
      return <EntityChip data={ref} variant='input' isInputChip />;
    },
  };
}
