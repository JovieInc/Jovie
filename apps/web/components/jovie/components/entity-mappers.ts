/**
 * Shared mappers from raw query rows to chat-picker `EntityRef`s.
 *
 * Both the cmd+k registry path (`release-provider.tsx`, `artist-provider.tsx`)
 * and the chat slash picker (`SlashCommandMenu.useSlashItems`) need to turn
 * the same source rows into the same display shape. Owning that conversion
 * once here keeps subtitle / popularity / duration formatting consistent
 * and removes the duplication SonarCloud was flagging.
 */

import type { EntityRef } from '@/lib/commands/entities';
import type { SpotifyArtistResult } from '@/lib/contracts/api';

export interface ReleaseLikeRow {
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

function normalizeIso(iso: string): string {
  // Date-only strings (YYYY-MM-DD) are parsed as UTC midnight by the spec,
  // but older engines parsed them as local midnight. Appending T00:00:00Z
  // makes the intent unambiguous across all runtimes.
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso;
}

/** Format an ISO date as a short "Mon DD" label (e.g. "Mar 14"). */
export function shortMonthDay(iso?: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(normalizeIso(iso));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Format an ISO date as a long "Mon DD, YYYY" label (e.g. "Mar 14, 2026"). */
export function formatLongDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(normalizeIso(iso));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Capitalize a release type token (album/single/ep) into a display label. */
export function releaseTypeLabel(type?: string): string {
  if (!type) return 'Release';
  const lower = type.toLowerCase();
  if (lower === 'album') return 'Album';
  if (lower === 'single') return 'Single';
  if (lower === 'ep') return 'EP';
  return type;
}

/** Substring + artist-name match used by both provider + picker. */
export function releaseRowMatches(
  release: ReleaseLikeRow,
  lowerQuery: string
): boolean {
  if (!lowerQuery) return true;
  if (release.title.toLowerCase().includes(lowerQuery)) return true;
  return (release.artistNames ?? []).some(n =>
    n.toLowerCase().includes(lowerQuery)
  );
}

/** Convert a release row to the picker's display-ready EntityRef. */
export function releaseRowToEntityRef(release: ReleaseLikeRow): EntityRef {
  const dateLabel = shortMonthDay(release.releaseDate);
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

/** Convert a Spotify artist search result to a picker EntityRef. */
export function artistResultToEntityRef(r: SpotifyArtistResult): EntityRef {
  return {
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
  };
}
