'use client';

import { useEffect, useMemo } from 'react';
import type {
  EntityProvider,
  EntityRef,
  EntitySearchResult,
} from '@/lib/commands/entities';
import { useArtistSearchQuery } from '@/lib/queries/useArtistSearchQuery';
import { EntityChip } from './EntityChip';

/**
 * EntityProvider for artists. Uses Spotify artist search (debounced, cached
 * via TanStack Query) so the slash menu can reference any artist in the
 * Spotify catalog, not just artists previously linked to the profile.
 *
 * `isLoading` reflects the hook's own state — `loading` during fetch,
 * `idle` otherwise.
 */
export const artistProvider: EntityProvider = {
  kind: 'artist',
  label: 'Artists',
  useSearch(query: string): EntitySearchResult {
    const { results, state, search } = useArtistSearchQuery({
      limit: 8,
      minQueryLength: 1,
    });

    useEffect(() => {
      search(query);
    }, [query, search]);

    return useMemo(() => {
      const items: EntityRef[] = results.map(r => ({
        kind: 'artist',
        id: r.id,
        label: r.name,
        thumbnail: r.imageUrl,
        meta: {
          kind: 'artist',
          subtitle: r.isClaimed ? 'You' : 'Spotify artist',
          followers: r.followers,
          popularity: r.popularity,
          verified: r.verified,
          isYou: r.isClaimed,
        },
      }));
      return { items, isLoading: state === 'loading' };
    }, [results, state]);
  },
  renderChip(ref) {
    return <EntityChip data={ref} variant='input' isInputChip />;
  },
};
