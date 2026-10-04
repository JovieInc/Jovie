import { isReleaseProviderUrl } from '@/lib/agent-acquisition/release-resolution';
import { LINK_QUERY_MAX } from './contract';

const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

export type ParsedLinkInput =
  | {
      readonly kind: 'track';
      readonly source: 'url';
      readonly url: string;
      readonly providerKey: string | null;
    }
  | { readonly kind: 'track'; readonly source: 'isrc'; readonly isrc: string }
  | { readonly kind: 'track'; readonly source: 'text'; readonly query: string }
  | { readonly kind: 'artist'; readonly source: 'url'; readonly url: string }
  | { readonly kind: 'artist'; readonly source: 'text'; readonly query: string }
  | {
      readonly kind: 'invalid';
      readonly code: 'UNSUPPORTED_INPUT';
    };

function invalid(): ParsedLinkInput {
  return { kind: 'invalid', code: 'UNSUPPORTED_INPUT' };
}

export function normalizeIsrc(value: string): string | null {
  const compact = value.trim().replaceAll('-', '').toUpperCase();
  return ISRC_PATTERN.test(compact) ? compact : null;
}

/** Stable dedupe identity for a DSP URL. Null when the URL has no stable id. */
export function providerKeyForUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'open.spotify.com' || host.endsWith('.spotify.com')) {
    const track = /^\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})\/?$/.exec(
      url.pathname
    );
    if (track) return `spotify:${track[1]}`;
    const artist = /^\/(?:intl-[a-z]{2}\/)?artist\/([A-Za-z0-9]{22})\/?$/.exec(
      url.pathname
    );
    if (artist) return `artist:spotify:${artist[1]}`;
  }
  if (host === 'music.apple.com' || host === 'itunes.apple.com') {
    const song = /^\/[a-z]{2}\/song\/(?:[^/]+\/)?(\d+)\/?$/.exec(url.pathname);
    if (song) return `apple_music:${song[1]}`;
    const trackId = url.searchParams.get('i');
    if (
      trackId &&
      /^\d+$/.test(trackId) &&
      /^\/[a-z]{2}\/album\//.test(url.pathname)
    ) {
      return `apple_music:${trackId}`;
    }
    const artist = /^\/[a-z]{2}\/artist\/(?:[^/]+\/)?(\d+)\/?$/.exec(
      url.pathname
    );
    if (artist) return `artist:apple_music:${artist[1]}`;
  }
  if (host === 'deezer.com' || host === 'www.deezer.com') {
    const track = /^\/(?:[a-z]{2}\/)?track\/(\d+)\/?$/.exec(url.pathname);
    if (track) return `deezer:${track[1]}`;
  }
  if (
    host === 'music.youtube.com' ||
    host === 'www.youtube.com' ||
    host === 'youtube.com' ||
    host === 'youtu.be'
  ) {
    const id =
      host === 'youtu.be'
        ? /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1]
        : url.searchParams.get('v');
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return `youtube:${id}`;
  }
  return null;
}

function isArtistUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'open.spotify.com') {
    return /^\/(?:intl-[a-z]{2}\/)?artist\/[A-Za-z0-9]{22}\/?$/.test(
      url.pathname
    );
  }
  if (host === 'music.apple.com') {
    return /^\/[a-z]{2}\/artist\/(?:[^/]+\/)?\d+\/?$/.test(url.pathname);
  }
  return false;
}

function httpsUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return null;
  }
  return url;
}

/**
 * Classify one input. A bare name is an artist. "Artist - Track" is a track.
 * Names never become a link inside this parser.
 */
export function parseLinkQuery(
  raw: string,
  requested?: 'track' | 'artist'
): ParsedLinkInput {
  const query = raw.trim();
  if (!query || query.length > LINK_QUERY_MAX) return invalid();

  const isrc = normalizeIsrc(query);
  if (isrc) {
    if (requested === 'artist') return invalid();
    return { kind: 'track', source: 'isrc', isrc };
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(query) || query.startsWith('//')) {
    const url = httpsUrl(query);
    if (!url) return invalid();
    const href = url.href;
    if (isArtistUrl(href)) {
      if (requested === 'track') return invalid();
      return { kind: 'artist', source: 'url', url: href };
    }
    if (isReleaseProviderUrl(href)) {
      if (requested === 'artist') return invalid();
      return {
        kind: 'track',
        source: 'url',
        url: href,
        providerKey: providerKeyForUrl(href),
      };
    }
    return invalid();
  }

  if (
    requested === 'track' ||
    (requested !== 'artist' && query.includes(' - '))
  ) {
    return { kind: 'track', source: 'text', query };
  }
  return { kind: 'artist', source: 'text', query };
}
