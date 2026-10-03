/**
 * MusicBrainz Provider for DSP Enrichment
 * @see https://musicbrainz.org/doc/MusicBrainz_API
 */

import 'server-only';

import { musicBrainzLookupLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import { musicBrainzCircuitBreaker } from '../circuit-breakers';
import type { MusicBrainzArtist, MusicBrainzRecording } from '../types';

const MUSICBRAINZ_API_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Jovie/1.0.0 (https://jov.ie)';
const REQUEST_TIMEOUT_MS = 10_000;

export class MusicBrainzError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = 'MusicBrainzError';
  }
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 1500;

function isNonRetryableError(error: unknown): boolean {
  if (error instanceof MusicBrainzError) {
    return (
      error.statusCode === 404 ||
      error.statusCode === 400 ||
      error.statusCode === 429
    );
  }
  return false;
}

function calculateBackoffDelay(attempt: number, baseDelayMs: number): number {
  const jitter =
    (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * 0.3 + 0.85;
  return baseDelayMs * Math.pow(2, attempt) * jitter;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = DEFAULT_MAX_RETRIES,
  baseDelayMs = DEFAULT_BASE_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (isNonRetryableError(error)) throw error;
      if (attempt >= maxRetries) throw lastError;
      // Bounded retry backoff required by MusicBrainz API terms of use (1 req/sec).
      // Max total delay is ~5s across all retries — safe within serverless limits.
      const delayMs = calculateBackoffDelay(attempt, baseDelayMs);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError ?? new Error('Unknown retry failure');
}

async function musicBrainzRequest<T>(endpoint: string): Promise<T> {
  const limitResult =
    await musicBrainzLookupLimiter.limit('musicbrainz:global');
  if (!limitResult.success) {
    throw new MusicBrainzError(
      limitResult.reason ?? 'Rate limit exceeded',
      429,
      'RATE_LIMITED'
    );
  }

  const url = `${MUSICBRAINZ_API_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}fmt=json`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (response.status === 503 || response.status === 429) {
      throw new MusicBrainzError(
        'Rate limit exceeded',
        response.status,
        'RATE_LIMITED'
      );
    }
    if (!response.ok) {
      throw new MusicBrainzError(
        `MusicBrainz API error: ${response.status}`,
        response.status
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof MusicBrainzError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MusicBrainzError('Request timeout', undefined, 'TIMEOUT');
    }
    throw new MusicBrainzError(
      `MusicBrainz request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

async function executeWithCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
  return musicBrainzCircuitBreaker.execute(() => withRetry(fn));
}

export async function lookupMusicBrainzByIsrc(
  isrc: string
): Promise<MusicBrainzRecording[]> {
  try {
    const response = await executeWithCircuitBreaker(async () => {
      return musicBrainzRequest<{ recordings: MusicBrainzRecording[] }>(
        `/isrc/${encodeURIComponent(isrc)}?inc=artist-credits+releases`
      );
    });
    return response.recordings ?? [];
  } catch (error) {
    if (
      error instanceof MusicBrainzError &&
      (error.statusCode === 404 || error.statusCode === 400)
    ) {
      return [];
    }
    throw error;
  }
}

export async function bulkLookupMusicBrainzByIsrc(
  isrcs: string[]
): Promise<Map<string, MusicBrainzRecording>> {
  const results = new Map<string, MusicBrainzRecording>();
  for (const isrc of isrcs) {
    try {
      const recordings = await lookupMusicBrainzByIsrc(isrc);
      if (recordings.length > 0) {
        results.set(isrc.toUpperCase(), recordings[0]);
      }
    } catch (error) {
      logger.warn('MusicBrainz ISRC lookup failed during bulk lookup', {
        isrc,
        error,
      });
    }
  }
  return results;
}

export async function getMusicBrainzArtist(
  mbid: string
): Promise<MusicBrainzArtist | null> {
  try {
    const artist = await executeWithCircuitBreaker(async () => {
      return musicBrainzRequest<MusicBrainzArtist>(
        `/artist/${encodeURIComponent(mbid)}?inc=aliases+tags+genres+url-rels`
      );
    });
    return artist;
  } catch (error) {
    if (error instanceof MusicBrainzError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

interface MusicBrainzNamedSearchHit {
  id?: string;
  name?: string;
  title?: string;
  barcode?: string;
  score?: number;
}

function exactName(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return normalize(left) === normalize(right);
}

/**
 * Name search, then url-rels only when one artist name matches exactly.
 * Several exact names stay unresolved here so the caller can ask for a choice.
 */
export async function matchMusicBrainzArtistByName(
  name: string
): Promise<
  | { status: 'found'; artist: MusicBrainzArtist }
  | { status: 'ambiguous'; count: number }
  | { status: 'none' }
> {
  const trimmed = name.trim();
  if (!trimmed) return { status: 'none' };
  const response = await executeWithCircuitBreaker(() =>
    musicBrainzRequest<{ artists?: MusicBrainzNamedSearchHit[] }>(
      `/artist?query=${encodeURIComponent(`artist:"${trimmed.replace(/["\\]/g, ' ')}"`)}&limit=5`
    )
  );
  const exact = (response.artists ?? []).filter(
    hit => hit.id && hit.name && exactName(hit.name, trimmed)
  );
  if (exact.length > 1) return { status: 'ambiguous', count: exact.length };
  const only = exact[0];
  if (!only?.id) return { status: 'none' };
  const artist = await getMusicBrainzArtist(only.id);
  if (!artist) return { status: 'none' };
  return { status: 'found', artist };
}

export async function lookupMusicBrainzReleaseByBarcode(
  barcode: string
): Promise<{
  id: string;
  title: string;
  artist: string | null;
  barcode: string;
  relations: MusicBrainzArtist['relations'];
} | null> {
  const digits = barcode.replace(/\D/g, '');
  if (!digits) return null;
  const response = await executeWithCircuitBreaker(() =>
    musicBrainzRequest<{ releases?: MusicBrainzNamedSearchHit[] }>(
      `/release?query=${encodeURIComponent(`barcode:${digits}`)}&limit=5`
    )
  );
  const hit = (response.releases ?? []).find(
    release => release.id && release.barcode?.replace(/\D/g, '') === digits
  );
  const releaseId = hit?.id;
  if (!releaseId) return null;
  const release = await executeWithCircuitBreaker(() =>
    musicBrainzRequest<{
      id?: string;
      title?: string;
      barcode?: string;
      relations?: MusicBrainzArtist['relations'];
      'artist-credit'?: Array<{ name?: string; artist?: { name?: string } }>;
    }>(`/release/${encodeURIComponent(releaseId)}?inc=artist-credits+url-rels`)
  );
  const artist =
    release['artist-credit']?.find(credit => credit.name || credit.artist?.name)
      ?.name ??
    release['artist-credit']?.[0]?.artist?.name ??
    null;
  return {
    id: release.id ?? releaseId,
    title: release.title ?? hit?.title ?? '',
    artist,
    barcode: digits,
    relations: release.relations ?? [],
  };
}

export async function lookupMusicBrainzRecordingUrlRels(
  isrc: string
): Promise<NonNullable<MusicBrainzArtist['relations']>> {
  const recordings = await lookupMusicBrainzByIsrc(isrc);
  const recording = recordings[0];
  if (!recording?.id) return [];
  const detail = await executeWithCircuitBreaker(() =>
    musicBrainzRequest<{ relations?: MusicBrainzArtist['relations'] }>(
      `/recording/${encodeURIComponent(recording.id)}?inc=url-rels`
    )
  );
  return detail.relations ?? [];
}

export function isMusicBrainzAvailable(): boolean {
  return musicBrainzCircuitBreaker.getState() !== 'OPEN';
}

export function getMusicBrainzStats() {
  return {
    configured: true,
    circuitBreaker: musicBrainzCircuitBreaker.getStats(),
  };
}
