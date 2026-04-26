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
  readonly releaseDate?: string;
  readonly releaseType?: string;
  readonly spotifyPopularity?: number | null;
  readonly totalTracks?: number;
  readonly totalDurationMs?: number | null;
}

function releaseMatches(release: ReleaseLike, lowerQuery: string): boolean {
  if (!lowerQuery) return true;
  if (release.title.toLowerCase().includes(lowerQuery)) return true;
  return (release.artistNames ?? []).some(n =>
    n.toLowerCase().includes(lowerQuery)
  );
}

function shortMonth(iso?: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

function releaseTypeLabel(type?: string): string {
  if (!type) return 'Release';
  const lower = type.toLowerCase();
  if (lower === 'album') return 'Album';
  if (lower === 'single') return 'Single';
  if (lower === 'ep') return 'EP';
  return type;
}

function toEntityRef(release: ReleaseLike): EntityRef {
  const dateLabel = shortMonth(release.releaseDate);
  const typeLabel = releaseTypeLabel(release.releaseType);
  const subtitle = dateLabel ? `${typeLabel} · ${dateLabel}` : typeLabel;
  return {
    kind: 'release',
    id: release.id,
    label: release.title,
    thumbnail: release.artworkUrl ?? undefined,
    meta: {
      kind: 'release',
      subtitle,
      releaseDate: release.releaseDate,
      releaseType: release.releaseType,
      spotifyPopularity: release.spotifyPopularity ?? null,
      totalTracks: release.totalTracks,
      totalDurationMs: release.totalDurationMs ?? null,
    },
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
