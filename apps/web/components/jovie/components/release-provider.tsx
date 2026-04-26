'use client';

import { useMemo } from 'react';
import type {
  EntityProvider,
  EntitySearchResult,
} from '@/lib/commands/entities';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import { EntityChip } from './EntityChip';
import {
  type ReleaseLikeRow,
  releaseRowMatches,
  releaseRowToEntityRef,
} from './entity-mappers';

/**
 * Build an EntityProvider for releases scoped to a given profile.
 *
 * Releases are pre-loaded (not server-searched) — the creator's full catalog
 * rarely exceeds a few hundred rows, so a local substring filter is simpler
 * than hitting an API per keystroke. The slash menu already has typeahead
 * latency built in via React; we don't need to debounce over the wire.
 *
 * Mapping logic lives in `entity-mappers.ts` and is shared with the inline
 * chat slash picker (`SlashCommandMenu.useSlashItems`) so subtitle / date /
 * popularity formatting stays identical across surfaces.
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
          .filter(r => releaseRowMatches(r as ReleaseLikeRow, lowerQuery))
          .slice(0, 8)
          .map(r => releaseRowToEntityRef(r as ReleaseLikeRow));
        return { items, isLoading };
      }, [data, isLoading, query]);
    },
    renderChip(ref) {
      return <EntityChip data={ref} variant='input' isInputChip />;
    },
  };
}
