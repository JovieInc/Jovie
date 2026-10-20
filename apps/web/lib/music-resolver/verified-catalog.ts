import 'server-only';

import { type CatalogTrack, PROVENANCE_CONFIDENCE } from './in-house-contracts';
import {
  matchesNumericId,
  readProviderJson,
  providerRecord as record,
} from './provider-response';

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function identifier(value: unknown, pattern: RegExp): string | null {
  const normalized = text(value)?.toUpperCase();
  return normalized && pattern.test(normalized) ? normalized : null;
}

/** Hydrate identities with existing official clients, never a pasted-URL seed. */
export async function verifyCatalogUrl(
  href: string,
  provider: string,
  kind: 'track' | 'album',
  territory?: string,
  callerSignal?: AbortSignal
): Promise<CatalogTrack | null> {
  const url = new URL(href);
  const signal = callerSignal
    ? AbortSignal.any([AbortSignal.timeout(8_000), callerSignal])
    : AbortSignal.timeout(8_000);
  signal.throwIfAborted();
  let item: Record<string, unknown> | null;
  let canonicalUrl: string;
  let title: unknown;
  let artist: unknown;
  let ids: Record<string, unknown> | null;
  if (provider === 'spotify') {
    const id = url.pathname.match(
      new RegExp(`^/(?:intl-[a-z]{2}/)?${kind}/([A-Za-z0-9]{22})/?$`)
    )?.[1];
    if (!id || url.hostname !== 'open.spotify.com') return null;
    const { isSpotifyAvailable, spotifyClient } = await import(
      '@/lib/spotify/client'
    );
    signal.throwIfAborted();
    if (!isSpotifyAvailable())
      throw new Error('Spotify catalog source unavailable');
    let payload: unknown;
    try {
      payload = await spotifyClient.requestJson<unknown>(
        `/${kind}s/${id}${territory ? `?market=${territory.toUpperCase()}` : ''}`,
        { signal, redirect: 'error' }
      );
    } catch (error) {
      signal.throwIfAborted();
      if (record(error)?.status === 404) return null;
      throw error;
    }
    signal.throwIfAborted();
    item = record(payload);
    if (!item) throw new Error('Invalid Spotify catalog response');
    const linked = record(item.linked_from);
    const validId =
      typeof item.id === 'string' && /^[A-Za-z0-9]{22}$/.test(item.id);
    if (
      !validId ||
      item.type !== kind ||
      (item.id !== id &&
        !(kind === 'track' && linked?.id === id && linked.type === 'track'))
    )
      return null;
    if (item.is_playable === false) return null;
    title = item.name;
    artist = Array.isArray(item.artists) ? record(item.artists[0])?.name : null;
    ids = record(item.external_ids);
    canonicalUrl = `https://open.spotify.com/${kind}/${item.id}`;
  } else if (provider === 'apple_music') {
    if (url.hostname !== 'music.apple.com') return null;
    const match = url.pathname.match(
      /^\/([a-z]{2})\/(album|song)\/(?:[^/]+\/)?(?:id)?([1-9]\d*)\/?$/
    );
    if (!match || (kind === 'album' && match[2] !== 'album')) return null;
    const id =
      kind === 'track' && match[2] === 'album'
        ? url.searchParams.get('i')
        : match[3];
    if (!id || !/^[1-9]\d*$/.test(id)) return null;
    const country = (territory ?? match[1]).toLowerCase();
    const payload = await readProviderJson(
      `https://itunes.apple.com/lookup?id=${id}&entity=${kind === 'track' ? 'song' : 'album'}&country=${country}`,
      signal
    );
    if (payload === undefined) return null;
    const rows = record(payload)?.results;
    if (!Array.isArray(rows)) throw new Error('Invalid Apple catalog response');
    item =
      rows
        .map(record)
        .find(
          row =>
            row &&
            (kind === 'track'
              ? row.wrapperType === 'track' &&
                row.kind === 'song' &&
                matchesNumericId(row.trackId, id)
              : row.wrapperType === 'collection' &&
                row.collectionType === 'Album' &&
                matchesNumericId(row.collectionId, id))
        ) ?? null;
    if (!item) return null;
    title = kind === 'track' ? item.trackName : item.collectionName;
    artist = item.artistName;
    ids = item;
    if (kind === 'track') {
      const albumId = item.collectionId;
      if (
        typeof albumId !== 'number' ||
        !Number.isSafeInteger(albumId) ||
        albumId <= 0
      )
        return null;
      canonicalUrl = `https://music.apple.com/${country}/album/${albumId}?i=${id}`;
    } else canonicalUrl = `https://music.apple.com/${country}/album/${id}`;
  } else if (provider === 'deezer') {
    const id = url.pathname.match(
      new RegExp(`^/(?:[a-z]{2}/)?${kind}/([1-9]\\d*)/?$`)
    )?.[1];
    if (!id || !['deezer.com', 'www.deezer.com'].includes(url.hostname))
      return null;
    const payload = await readProviderJson(
      `https://api.deezer.com/${kind}/${id}`,
      signal
    );
    if (payload === undefined) return null;
    item = record(payload);
    if (!item) throw new Error('Invalid Deezer catalog response');
    if ('error' in item) {
      const error = record(item.error);
      if (error?.type === 'DataException' && error.code === 800) return null;
      throw new Error('Deezer catalog source failed');
    }
    if (
      !matchesNumericId(item.id, id) ||
      item.type !== kind ||
      item.readable === false
    )
      return null;
    title = item.title;
    artist = record(item.artist)?.name;
    ids = item;
    canonicalUrl = `https://www.deezer.com/${kind}/${id}`;
  } else throw new Error(`Catalog URL source unavailable: ${provider}`);
  const name = text(title);
  const artistName = text(artist);
  if (!name || !artistName) return null;
  return {
    provider,
    title: name,
    artist: artistName,
    url: canonicalUrl,
    isrc:
      kind === 'track'
        ? identifier(ids?.isrc, /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/)
        : null,
    upc:
      kind === 'album' ? identifier(ids?.upc, /^(?:\d{8}|\d{12,14})$/) : null,
    provenance: 'input_url',
    confidence: PROVENANCE_CONFIDENCE.input_url,
  };
}
