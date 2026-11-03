import 'server-only';

import { matchArtistCredits, sameCatalogName, sameUpc } from './catalog-names';
import { type CatalogAlbum, PROVENANCE_CONFIDENCE } from './in-house-contracts';
import { providerRecord as record } from './provider-response';

/**
 * Spotify and Deezer album adapters (JOV-7822 coverage gap).
 *
 * Official endpoints only: Spotify Web API search (`upc:` album filter, then
 * `GET /albums` for the album's own external_ids) and Deezer
 * `/album/upc:{upc}` plus `/album/{id}`.
 *
 * Every album these return was read back from the provider's own record and
 * carries the UPC that record reports. A search hit whose record does not
 * report the queried UPC is dropped, so a fuzzy provider match can never
 * become a link. Failures return nothing (abstain) rather than throw.
 */

const TIMEOUT_MS = 8_000;
const MAX_VERIFIED = 5;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** UPC-A, EAN-13 and GTIN-14 spellings of one code, most common first. */
export function upcVariants(upc: string): string[] {
  const stripped = upc.replace(/\D/g, '').replace(/^0+/, '');
  if (!stripped) return [];
  const forms = [13, 12, 14].filter(width => width >= stripped.length);
  return [
    ...new Set([
      ...forms.map(width => stripped.padStart(width, '0')),
      stripped,
    ]),
  ];
}

function names(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap(entry => {
        const name = text(record(entry)?.name);
        return name ? [name] : [];
      })
    : [];
}

function spotifyAlbumFrom(
  item: Record<string, unknown>,
  upc: string | null
): CatalogAlbum | null {
  const id = text(item.id);
  const title = text(item.name);
  const artists = names(item.artists);
  const artist = artists[0];
  if (!id || !/^[A-Za-z0-9]{22}$/.test(id) || !title || !artist) return null;
  return {
    provider: 'spotify',
    title,
    artist: artists.join(', '),
    artists,
    url: `https://open.spotify.com/album/${id}`,
    upc,
    provenance: 'upc_exact',
    confidence: PROVENANCE_CONFIDENCE.upc_exact,
  };
}

async function spotifyRequest(
  endpoint: string,
  signal?: AbortSignal
): Promise<unknown | null> {
  try {
    const { isSpotifyAvailable, spotifyClient } = await import(
      '@/lib/spotify/client'
    );
    if (!isSpotifyAvailable()) return null;
    const combined = signal
      ? AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), signal])
      : AbortSignal.timeout(TIMEOUT_MS);
    return await spotifyClient.requestJson<unknown>(endpoint, {
      signal: combined,
    });
  } catch {
    return null;
  }
}

/** Full album records, keyed by id, so external_ids.upc can be checked. */
async function spotifyAlbumRecords(
  ids: readonly string[],
  signal?: AbortSignal
): Promise<Record<string, unknown>[]> {
  const unique = [...new Set(ids)].slice(0, MAX_VERIFIED);
  if (unique.length === 0) return [];
  const payload = await spotifyRequest(
    `/albums?ids=${unique.join(',')}`,
    signal
  );
  const albums = record(payload)?.albums;
  return Array.isArray(albums)
    ? albums.flatMap(entry => {
        const item = record(entry);
        return item && item.type === 'album' ? [item] : [];
      })
    : [];
}

function searchedAlbumIds(payload: unknown): string[] {
  const items = record(record(payload)?.albums)?.items;
  return Array.isArray(items)
    ? items.flatMap(entry => {
        const id = text(record(entry)?.id);
        return id ? [id] : [];
      })
    : [];
}

export async function spotifyAlbumsByUpc(
  upc: string,
  signal?: AbortSignal
): Promise<CatalogAlbum[]> {
  for (const variant of upcVariants(upc)) {
    const ids = searchedAlbumIds(
      await spotifyRequest(
        `/search?q=${encodeURIComponent(`upc:${variant}`)}&type=album&limit=10`,
        signal
      )
    );
    if (ids.length === 0) continue;
    const verified = (await spotifyAlbumRecords(ids, signal)).flatMap(item => {
      const reported = text(record(item.external_ids)?.upc);
      const album = spotifyAlbumFrom(item, reported);
      return album && sameUpc(reported, upc) ? [album] : [];
    });
    // Two distinct Spotify albums for one UPC is ambiguous: abstain.
    const distinct = new Set(verified.map(album => album.url));
    if (distinct.size === 1) return verified.slice(0, 1);
    if (distinct.size > 1) return [];
  }
  return [];
}

function quoted(value: string): string {
  return `"${value.replace(/["\\]/g, ' ').trim()}"`;
}

export async function spotifySearchAlbums(
  artist: string,
  title: string,
  signal?: AbortSignal
): Promise<CatalogAlbum[]> {
  const queries = [
    `album:${quoted(title)} artist:${quoted(artist)}`,
    `${title} ${artist}`,
  ];
  let ids: string[] = [];
  let candidates: Record<string, unknown>[] = [];
  for (const q of queries) {
    const payload = await spotifyRequest(
      `/search?q=${encodeURIComponent(q)}&type=album&limit=10`,
      signal
    );
    const items = record(record(payload)?.albums)?.items;
    candidates = Array.isArray(items)
      ? items.flatMap(entry => {
          const item = record(entry);
          return item ? [item] : [];
        })
      : [];
    // Only releases that already look like the query are worth a UPC read.
    ids = candidates.flatMap(item => {
      const id = text(item.id);
      const albumTitle = text(item.name);
      return id &&
        albumTitle &&
        sameCatalogName(albumTitle, title) &&
        matchArtistCredits(
          artist,
          names(item.artists).join(', '),
          names(item.artists)
        )
        ? [id]
        : [];
    });
    if (ids.length > 0) break;
  }
  const records = await spotifyAlbumRecords(ids, signal);
  const withUpc = records.flatMap(item => {
    const reported = text(record(item.external_ids)?.upc);
    const album = reported ? spotifyAlbumFrom(item, reported) : null;
    return album
      ? [
          {
            ...album,
            provenance: 'exact_name',
            confidence: PROVENANCE_CONFIDENCE.exact_name,
          },
        ]
      : [];
  });
  // Title-different siblings stay as upc-less candidates so the resolver can
  // report ambiguity; same-title hits without a readable UPC are dropped.
  const verifiedIds = new Set(ids);
  const siblings = candidates.flatMap(item => {
    const id = text(item.id);
    if (!id || verifiedIds.has(id)) return [];
    const album = spotifyAlbumFrom(item, null);
    return album
      ? [
          {
            ...album,
            provenance: 'exact_name',
            confidence: PROVENANCE_CONFIDENCE.exact_name,
          },
        ]
      : [];
  });
  return [
    ...withUpc,
    ...siblings.filter(album => !sameCatalogName(album.title, title)),
  ];
}

async function deezerJson(
  url: string,
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, {
      signal: signal
        ? AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), signal])
        : AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
      redirect: 'error',
    });
    if (!response.ok) return null;
    const payload = record(await response.json());
    return payload && !('error' in payload) ? payload : null;
  } catch {
    return null;
  }
}

function deezerAlbumFrom(
  item: Record<string, unknown>,
  upc: string | null,
  provenance: string,
  confidence: number
): CatalogAlbum | null {
  const id = item.id;
  const title = text(item.title);
  const lead = text(record(item.artist)?.name);
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
    return null;
  if (!title || !lead) return null;
  const contributors = names(item.contributors);
  const artists = contributors.length > 0 ? contributors : [lead];
  return {
    provider: 'deezer',
    title,
    artist: artists.join(', '),
    artists,
    url: `https://www.deezer.com/album/${id}`,
    upc,
    provenance,
    confidence,
  };
}

export async function deezerAlbumsByUpc(
  upc: string,
  signal?: AbortSignal
): Promise<CatalogAlbum[]> {
  for (const variant of upcVariants(upc)) {
    const item = await deezerJson(
      `https://api.deezer.com/album/upc:${encodeURIComponent(variant)}`,
      signal
    );
    if (!item || item.type !== 'album') continue;
    const reported = text(item.upc);
    if (!sameUpc(reported, upc)) continue;
    const album = deezerAlbumFrom(
      item,
      reported,
      'upc_exact',
      PROVENANCE_CONFIDENCE.upc_exact
    );
    if (album) return [album];
  }
  return [];
}

export async function deezerSearchAlbums(
  artist: string,
  title: string,
  signal?: AbortSignal
): Promise<CatalogAlbum[]> {
  const payload = await deezerJson(
    `https://api.deezer.com/search/album?q=${encodeURIComponent(`artist:${quoted(artist)} album:${quoted(title)}`)}&limit=10`,
    signal
  );
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const ids = data.flatMap(entry => {
    const item = record(entry);
    const id = item?.id;
    const albumTitle = text(item?.title);
    const lead = text(record(item?.artist)?.name);
    return typeof id === 'number' &&
      albumTitle &&
      lead &&
      sameCatalogName(albumTitle, title) &&
      matchArtistCredits(artist, lead) !== null
      ? [id]
      : [];
  });
  const records = await Promise.all(
    [...new Set(ids)]
      .slice(0, MAX_VERIFIED)
      .map(id => deezerJson(`https://api.deezer.com/album/${id}`, signal))
  );
  return records.flatMap(item => {
    const reported = text(item?.upc);
    const album =
      item && reported && item.type === 'album'
        ? deezerAlbumFrom(
            item,
            reported,
            'exact_name',
            PROVENANCE_CONFIDENCE.exact_name
          )
        : null;
    return album &&
      matchArtistCredits(artist, album.artist, album.artists) !== null
      ? [album]
      : [];
  });
}
