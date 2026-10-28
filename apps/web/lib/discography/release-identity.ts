/**
 * Release identity for catalog import.
 *
 * A release is the same release only when a hard identifier says so
 * (provider album id, UPC) or when it is the same title by the same artists
 * on the same date (a market edition). Title alone never merges two releases:
 * a solo recording and a later collaboration, a remaster, or a re-release can
 * share a title while being distinct recordings.
 */

export interface ReleaseIdentityCandidate {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly upc: string | null;
  readonly releaseDate: Date | null;
  readonly metadata: unknown;
  /**
   * The release already has a Spotify provider link to the incoming album.
   * Legacy rows created before provider ids were stored in metadata are
   * identified this way, so a re-import re-verifies them instead of
   * duplicating them.
   */
  readonly providerLinked?: boolean;
}

export interface IncomingReleaseIdentity {
  readonly providerAlbumId: string;
  readonly upc: string | null;
  readonly normalizedTitle: string;
  readonly artistIds: readonly string[];
  readonly releaseDate: Date | null;
}

export function normalizeReleaseTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replaceAll(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function readMetadata(metadata: unknown): {
  spotifyId: string | null;
  artistIds: string[];
} {
  const record =
    metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>)
      : {};
  const artists = Array.isArray(record.spotifyArtists)
    ? record.spotifyArtists
    : [];
  return {
    spotifyId: typeof record.spotifyId === 'string' ? record.spotifyId : null,
    artistIds: artists
      .map(artist =>
        artist && typeof artist === 'object'
          ? (artist as { id?: unknown }).id
          : null
      )
      .filter((id): id is string => typeof id === 'string' && id !== ''),
  };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every(item => set.has(item));
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/**
 * Pick the existing creator release an incoming Spotify album refers to, or
 * null when it is a new release. Priority: provider album id, UPC, then a
 * title match that is also the same artists on the same release date.
 */
export function findExistingRelease<T extends ReleaseIdentityCandidate>(
  incoming: IncomingReleaseIdentity,
  candidates: readonly T[]
): T | null {
  const byProviderId = candidates.find(
    c => readMetadata(c.metadata).spotifyId === incoming.providerAlbumId
  );
  if (byProviderId) return byProviderId;

  const byLink = candidates.find(c => c.providerLinked);
  if (byLink) return byLink;

  if (incoming.upc) {
    const byUpc = candidates.find(c => c.upc === incoming.upc);
    if (byUpc) return byUpc;
  }

  return (
    candidates.find(c => {
      if (normalizeReleaseTitle(c.title) !== incoming.normalizedTitle) {
        return false;
      }
      const meta = readMetadata(c.metadata);
      return (
        sameSet(meta.artistIds, incoming.artistIds) &&
        sameDay(c.releaseDate, incoming.releaseDate)
      );
    }) ?? null
  );
}
