import 'server-only';

import {
  type ArtistCandidate,
  PROVENANCE_CONFIDENCE,
} from './in-house-contracts';

const TIMEOUT_MS = 8_000;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** An official 404 is absence; rate limits, outages and malformed JSON are not. */
async function readArtistJson(
  url: string,
  signal: AbortSignal
): Promise<unknown> {
  signal.throwIfAborted();
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal,
    redirect: 'error',
  });
  signal.throwIfAborted();
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Artist provider HTTP ${response.status}`);
  const payload: unknown = await response.json();
  signal.throwIfAborted();
  return payload;
}

function matchesNumericId(value: unknown, id: string): boolean {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    String(value) === id
  );
}

/** Called only for a validated artist URL when MusicBrainz has no URL relation. */
export async function verifyArtistUrl(
  href: string,
  provider: string,
  callerSignal?: AbortSignal
): Promise<ArtistCandidate | null> {
  const url = new URL(href);
  const lastSegment = url.pathname.split('/').filter(Boolean).at(-1);
  const id =
    provider === 'apple_music' ? lastSegment?.replace(/^id/, '') : lastSegment;
  if (!id) return null;
  const signal = callerSignal
    ? AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), callerSignal])
    : AbortSignal.timeout(TIMEOUT_MS);
  signal.throwIfAborted();
  let artist: Record<string, unknown> | null;
  let canonicalUrl: string;
  let name: unknown;
  if (provider === 'spotify') {
    const { isSpotifyAvailable, spotifyClient } = await import(
      '@/lib/spotify/client'
    );
    if (!isSpotifyAvailable())
      throw new Error('Spotify artist source unavailable');
    let payload: unknown;
    try {
      payload = await spotifyClient.requestJson<unknown>(`/artists/${id}`, {
        signal,
        redirect: 'error',
      });
    } catch (error) {
      if (record(error)?.status === 404) return null;
      throw error;
    }
    signal.throwIfAborted();
    artist = record(payload);
    if (!artist) throw new Error('Invalid Spotify artist response');
    if (artist.id !== id || artist.type !== 'artist') return null;
    name = artist.name;
    canonicalUrl = `https://open.spotify.com/artist/${id}`;
  } else if (provider === 'apple_music') {
    const country = url.pathname.split('/')[1];
    const payload = await readArtistJson(
      `https://itunes.apple.com/lookup?id=${id}&entity=musicArtist&country=${country}`,
      signal
    );
    if (payload === undefined) return null;
    const results = record(payload)?.results;
    if (!Array.isArray(results))
      throw new Error('Invalid Apple artist response');
    artist =
      results
        .map(record)
        .find(
          row =>
            row?.wrapperType === 'artist' && matchesNumericId(row.artistId, id)
        ) ?? null;
    if (!artist) return null;
    name = artist.artistName;
    canonicalUrl = `https://music.apple.com/${country}/artist/${id}`;
  } else if (provider === 'deezer') {
    const payload = await readArtistJson(
      `https://api.deezer.com/artist/${id}`,
      signal
    );
    if (payload === undefined) return null;
    artist = record(payload);
    if (!artist) throw new Error('Invalid Deezer artist response');
    if ('error' in artist) {
      const error = record(artist.error);
      if (error?.type === 'DataException' && error.code === 800) return null;
      throw new Error('Deezer artist source failed');
    }
    if (!matchesNumericId(artist.id, id) || artist.type !== 'artist')
      return null;
    name = artist.name;
    canonicalUrl = `https://www.deezer.com/artist/${id}`;
  } else {
    return null;
  }
  if (typeof name !== 'string' || !name.trim()) return null;
  return {
    name: name.trim(),
    url: canonicalUrl,
    mbid: null,
    links: [
      {
        provider,
        url: canonicalUrl,
        provenance: 'input_url',
        confidence: PROVENANCE_CONFIDENCE.input_url,
      },
    ],
  };
}
