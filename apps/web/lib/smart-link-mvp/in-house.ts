import 'server-only';

import { PROVIDER_CONFIG } from '@/lib/discography/config';
import {
  lookupAppleMusicByIsrc,
  lookupSpotifyByIsrc,
} from '@/lib/discography/provider-links';
import { isSpotifyAvailable, spotifyClient } from '@/lib/spotify/client';
import type { LinkCandidate, LinkProvider } from './contract';
import { sameRecording, splitArtistTitle } from './match';
import { normalizeIsrc, providerKeyForUrl } from './parse-input';
import type { ResolvedRelease } from './types';

const TIMEOUT_MS = 8_000;

interface CatalogHit {
  readonly id: string;
  readonly provider: 'apple_music' | 'deezer';
  readonly title: string;
  readonly artist: string;
  readonly url: string;
  readonly artworkUrl: string | null;
  readonly isrc: string | null;
}

export type InHouseSearch =
  | { readonly status: 'ok'; readonly candidates: readonly LinkCandidate[] }
  | { readonly status: 'unavailable' };

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol === 'http:' &&
      (url.hostname === 'deezer.com' ||
        url.hostname.endsWith('.deezer.com') ||
        url.hostname.endsWith('.apple.com'))
    ) {
      url.protocol = 'https:';
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function artworkUrl(value: unknown): string | null {
  const href = httpsUrl(value);
  if (!href) return null;
  return href.includes('100x100bb')
    ? href.replace('100x100bb', '600x600bb')
    : href;
}

function linkProvider(key: string, url: string): LinkProvider | null {
  const config = PROVIDER_CONFIG[key];
  const href = httpsUrl(url);
  if (!config || !href) return null;
  return { key, label: config.label, url: href };
}

function cleanAppleUrl(value: string): string | null {
  const href = httpsUrl(value);
  if (!href) return null;
  const url = new URL(href);
  url.searchParams.delete('uo');
  url.searchParams.delete('at');
  url.searchParams.delete('app');
  return url.href;
}

async function readJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function appleSongs(payload: unknown): CatalogHit[] {
  if (!payload || typeof payload !== 'object') return [];
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const hits: CatalogHit[] = [];
  for (const row of results) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const title = text(record.trackName);
    const artist = text(record.artistName);
    const rawUrl = text(record.trackViewUrl);
    const id = record.trackId;
    const trackId =
      typeof id === 'number' || typeof id === 'string' ? String(id) : null;
    const url = rawUrl ? cleanAppleUrl(rawUrl) : null;
    if (!title || !artist || !url || !trackId) continue;
    hits.push({
      id: `apple_music:${trackId}`,
      provider: 'apple_music',
      title,
      artist,
      url,
      artworkUrl: artworkUrl(record.artworkUrl100),
      isrc: normalizeIsrc(text(record.isrc) ?? ''),
    });
  }
  return hits;
}

function deezerSongs(payload: unknown): CatalogHit[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const hits: CatalogHit[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const title = text(record.title);
    const artist = text(
      (record.artist as { name?: unknown } | undefined)?.name
    );
    const url = httpsUrl(record.link);
    const id = record.id;
    const trackId =
      typeof id === 'number' || typeof id === 'string' ? String(id) : null;
    if (!title || !artist || !url || !trackId) continue;
    const album = record.album as {
      cover_xl?: unknown;
      cover_medium?: unknown;
    };
    hits.push({
      id: `deezer:${trackId}`,
      provider: 'deezer',
      title,
      artist,
      url,
      artworkUrl: artworkUrl(album?.cover_xl ?? album?.cover_medium),
      isrc: normalizeIsrc(text(record.isrc) ?? ''),
    });
  }
  return hits;
}

async function searchApple(term: string): Promise<CatalogHit[] | null> {
  const payload = await readJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=8&country=us`
  );
  return payload ? appleSongs(payload) : null;
}

async function searchDeezer(term: string): Promise<CatalogHit[] | null> {
  const payload = await readJson(
    `https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=8`
  );
  return payload ? deezerSongs(payload) : null;
}

async function deezerTrack(id: string): Promise<CatalogHit | null> {
  const payload = await readJson(
    `https://api.deezer.com/track/${encodeURIComponent(id)}`
  );
  if (!payload || typeof payload !== 'object') return null;
  if ('error' in payload && (payload as { error?: unknown }).error) return null;
  const [hit] = deezerSongs({ data: [payload] });
  return hit ?? null;
}

async function appleTrack(id: string): Promise<CatalogHit | null> {
  const payload = await readJson(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song&country=us`
  );
  const [hit] = appleSongs(payload);
  return hit ?? null;
}

function candidate(hit: CatalogHit): LinkCandidate {
  return {
    id: hit.id,
    name: hit.title,
    artist: hit.artist,
    url: hit.url,
    artworkUrl: hit.artworkUrl,
  };
}

function recordingKey(hit: CatalogHit): string {
  return `${hit.artist.toLowerCase()}::${hit.title.toLowerCase()}`;
}

function chooseHits(
  query: string,
  hits: readonly CatalogHit[]
): LinkCandidate[] {
  const split = splitArtistTitle(query);
  if (!split) return hits.slice(0, 5).map(candidate);
  const exact = hits.filter(hit => sameRecording(split, hit));
  if (exact.length > 0) {
    const groups = new Map<string, CatalogHit>();
    for (const hit of exact) {
      const key = recordingKey(hit);
      const current = groups.get(key);
      if (!current || hit.provider === 'apple_music') groups.set(key, hit);
    }
    return [...groups.values()].slice(0, 5).map(candidate);
  }
  return hits
    .filter(hit => sameRecording({ ...split, title: hit.title }, hit))
    .slice(0, 5)
    .map(candidate);
}

function releaseFromHits(
  hits: readonly CatalogHit[],
  extra: readonly LinkProvider[] = []
): ResolvedRelease | null {
  const providers: LinkProvider[] = [];
  const seen = new Set<string>();
  for (const item of extra) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    providers.push(item);
  }
  for (const hit of hits) {
    const item = linkProvider(hit.provider, hit.url);
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key);
    providers.push(item);
  }
  const first = hits[0];
  if (!first || providers.length === 0) return null;
  const isrc = hits.find(hit => hit.isrc)?.isrc ?? null;
  return {
    title: first.title,
    artist: first.artist,
    artworkUrl: hits.find(hit => hit.artworkUrl)?.artworkUrl ?? null,
    isrc,
    upc: null,
    providerKey: providerKeyForUrl(providers[0]?.url ?? '') ?? first.id,
    providers,
  };
}

async function fanOutNames(
  artist: string,
  title: string,
  extra: readonly LinkProvider[] = []
): Promise<ResolvedRelease | null> {
  const term = `${artist} ${title}`;
  const [apple, deezer] = await Promise.all([
    searchApple(term),
    searchDeezer(term),
  ]);
  const hits = [...(apple ?? []), ...(deezer ?? [])].filter(hit =>
    sameRecording({ artist, title }, hit)
  );
  const appleHit = hits.find(hit => hit.provider === 'apple_music');
  const deezerHit = hits.find(hit => hit.provider === 'deezer');
  const selected = [appleHit, deezerHit].filter((hit): hit is CatalogHit =>
    Boolean(hit)
  );
  let spotify: LinkProvider | null = null;
  const isrc = selected.find(hit => hit.isrc)?.isrc;
  if (isrc) {
    const found = await lookupSpotifyByIsrc(isrc);
    if (found?.url) spotify = linkProvider('spotify', found.url);
  }
  return releaseFromHits(selected, [...extra, ...(spotify ? [spotify] : [])]);
}

async function oembed(url: string): Promise<{
  readonly title: string | null;
  readonly thumbnail: string | null;
} | null> {
  const payload = await readJson(url);
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { title?: unknown; thumbnail_url?: unknown };
  return {
    title: text(record.title),
    thumbnail: artworkUrl(record.thumbnail_url),
  };
}

function sourceRelease(
  key: string,
  url: string,
  meta: { readonly title: string | null; readonly artworkUrl: string | null }
): ResolvedRelease | null {
  const item = linkProvider(key, url);
  if (!item) return null;
  return {
    title: meta.title,
    artist: null,
    artworkUrl: meta.artworkUrl,
    isrc: null,
    upc: null,
    providerKey: providerKeyForUrl(url),
    providers: [item],
  };
}

export async function resolveInHouseIsrc(
  isrc: string
): Promise<ResolvedRelease | null> {
  const [deezerPayload, appleLookup, spotifyLookup] = await Promise.all([
    readJson(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`),
    lookupAppleMusicByIsrc(isrc),
    lookupSpotifyByIsrc(isrc),
  ]);
  const deezer =
    deezerPayload &&
    typeof deezerPayload === 'object' &&
    !('error' in deezerPayload && (deezerPayload as { error?: unknown }).error)
      ? deezerSongs({ data: [deezerPayload] })[0]
      : undefined;
  const hits: CatalogHit[] = [];
  if (deezer) hits.push({ ...deezer, isrc: deezer.isrc ?? isrc });
  if (appleLookup?.url && appleLookup.trackName && appleLookup.artistName) {
    const url = cleanAppleUrl(appleLookup.url);
    if (url) {
      hits.push({
        id: `apple_music:${appleLookup.trackId ?? isrc}`,
        provider: 'apple_music',
        title: appleLookup.trackName,
        artist: appleLookup.artistName,
        url,
        artworkUrl: null,
        isrc,
      });
    }
  } else if (deezer) {
    const apple = await searchApple(`${deezer.artist} ${deezer.title}`);
    const match = apple?.find(hit =>
      sameRecording({ artist: deezer.artist, title: deezer.title }, hit)
    );
    if (match) hits.push({ ...match, isrc: match.isrc ?? isrc });
  }
  const extra: LinkProvider[] = [];
  if (spotifyLookup?.url) {
    const item = linkProvider('spotify', spotifyLookup.url);
    if (item) extra.push(item);
  }
  const release = releaseFromHits(hits, extra);
  return release ? { ...release, isrc: release.isrc ?? isrc } : null;
}

export async function resolveInHouseTrackUrl(
  url: string
): Promise<ResolvedRelease | null> {
  const key = providerKeyForUrl(url);
  if (key?.startsWith('spotify:')) {
    const id = key.slice('spotify:'.length);
    if (isSpotifyAvailable()) {
      try {
        const track = await spotifyClient.requestJson<{
          name?: string;
          external_ids?: { isrc?: string };
          artists?: Array<{ name?: string }>;
          album?: { images?: Array<{ url?: string }> };
        }>(`/tracks/${id}`);
        const title = text(track.name);
        const artist = text(track.artists?.[0]?.name);
        const isrc = normalizeIsrc(track.external_ids?.isrc ?? '');
        const art = artworkUrl(track.album?.images?.[0]?.url);
        const source = linkProvider('spotify', url);
        if (isrc) {
          const fanout = await resolveInHouseIsrc(isrc);
          if (fanout && source) {
            const providers = fanout.providers.some(
              item => item.key === 'spotify'
            )
              ? fanout.providers
              : [source, ...fanout.providers];
            return {
              ...fanout,
              title: fanout.title ?? title,
              artist: fanout.artist ?? artist,
              artworkUrl: fanout.artworkUrl ?? art,
              providerKey: key,
              providers,
            };
          }
        }
        if (title && artist) {
          const named = await fanOutNames(
            artist,
            title,
            source ? [source] : []
          );
          if (named) {
            return {
              ...named,
              artworkUrl: named.artworkUrl ?? art,
              providerKey: key,
            };
          }
        }
      } catch {
        // Spotify credentials can be missing or rejected. The pasted link still stands.
      }
    }
    const embed = await oembed(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
    );
    return sourceRelease('spotify', url, {
      title: embed?.title ?? null,
      artworkUrl: embed?.thumbnail ?? null,
    });
  }

  if (key?.startsWith('apple_music:')) {
    const song = await appleTrack(key.slice('apple_music:'.length));
    if (song) {
      const named = await fanOutNames(song.artist, song.title);
      const apple = linkProvider('apple_music', song.url);
      if (named && apple) {
        const providers = named.providers.some(
          item => item.key === 'apple_music'
        )
          ? named.providers
          : [apple, ...named.providers];
        return {
          ...named,
          title: song.title,
          artist: song.artist,
          artworkUrl: named.artworkUrl ?? song.artworkUrl,
          providerKey: key,
          providers,
        };
      }
      return releaseFromHits([song]);
    }
    return sourceRelease('apple_music', url, { title: null, artworkUrl: null });
  }

  if (key?.startsWith('deezer:')) {
    const song = await deezerTrack(key.slice('deezer:'.length));
    if (song) {
      const named = await fanOutNames(song.artist, song.title);
      const deezer = linkProvider('deezer', song.url);
      if (named && deezer) {
        const providers = named.providers.some(item => item.key === 'deezer')
          ? named.providers
          : [...named.providers, deezer];
        return {
          ...named,
          isrc: named.isrc ?? song.isrc,
          artworkUrl: named.artworkUrl ?? song.artworkUrl,
          providerKey: key,
          providers,
        };
      }
      return releaseFromHits([song]);
    }
    return sourceRelease('deezer', url, { title: null, artworkUrl: null });
  }

  if (key?.startsWith('youtube:')) {
    const embed = await oembed(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    const provider = url.includes('music.youtube.com')
      ? 'youtube_music'
      : 'youtube';
    return sourceRelease(provider, url, {
      title: embed?.title ?? null,
      artworkUrl: embed?.thumbnail ?? null,
    });
  }

  return null;
}

export async function searchInHouseTracks(
  query: string
): Promise<InHouseSearch> {
  const split = splitArtistTitle(query);
  const term = split ? `${split.artist} ${split.title}` : query;
  const [apple, deezer] = await Promise.all([
    searchApple(term),
    searchDeezer(term),
  ]);
  if (!apple && !deezer) return { status: 'unavailable' };
  return {
    status: 'ok',
    candidates: chooseHits(query, [...(apple ?? []), ...(deezer ?? [])]),
  };
}

export async function searchInHouseArtists(
  query: string
): Promise<readonly LinkCandidate[] | null> {
  const payload = await readJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=5&country=us`
  );
  if (!payload || typeof payload !== 'object') return null;
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const candidates: LinkCandidate[] = [];
  for (const row of results) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const name = text(record.artistName);
    const id = record.artistId;
    const artistId =
      typeof id === 'number' || typeof id === 'string' ? String(id) : null;
    const url = text(record.artistLinkUrl);
    const href = url ? cleanAppleUrl(url) : null;
    if (!name || !artistId || !href) continue;
    candidates.push({
      id: `artist:apple_music:${artistId}`,
      name,
      artist: null,
      url: href,
      artworkUrl: null,
    });
  }
  return candidates;
}
