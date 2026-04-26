'use client';

import { useEffect, useMemo } from 'react';
import type {
  EntityProvider,
  EntitySearchResult,
} from '@/lib/commands/entities';
import { useArtistSearchQuery } from '@/lib/queries/useArtistSearchQuery';
import { EntityChip } from './EntityChip';
import { artistResultToEntityRef } from './entity-mappers';

/**
 * EntityProvider for artists. Uses Spotify artist search (debounced, cached
 * via TanStack Query) so the slash menu can reference any artist in the
 * Spotify catalog, not just artists previously linked to the profile.
 *
 * `isLoading` reflects the hook's own state — `loading` during fetch,
 * `idle` otherwise. EntityRef shaping lives in `entity-mappers.ts` and is
 * shared with the inline chat slash picker.
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

    return useMemo(
      () => ({
        items: results.map(artistResultToEntityRef),
        isLoading: state === 'loading',
      }),
      [results, state]
    );
  },
  renderChip(ref) {
    return <EntityChip data={ref} variant='input' isInputChip />;
  },
};
