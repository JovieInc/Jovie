/**
 * MusicBrainz Provider for DSP Enrichment
 * @see https://musicbrainz.org/doc/MusicBrainz_API
 */

import 'server-only';

import { musicBrainzCircuitBreaker } from '../circuit-breakers';
import type { MusicBrainzArtist, MusicBrainzRecording } from '../types';

const MUSICBRAINZ_API_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Jovie/1.0.0 (https://jovie.fm)';
const REQUEST_TIMEOUT_MS = 10_000;
const RATE_LIMIT_DELAY_MS = 1100;

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
    return error.statusCode === 404 || error.statusCode === 400;
  }
  return false;
}

function calculateBackoffDelay(attempt: number, baseDelayMs: number): number {
  const jitter = Math.random() * 0.3 + 0.85;
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
      const delayMs = calculateBackoffDelay(attempt, baseDelayMs);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError ?? new Error('Unknown retry failure');
}

async function musicBrainzRequest<T>(endpoint: string): Promise<T> {
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
      throw new MusicBrainzError('Rate limit exceeded', response.status, 'RATE_LIMITED');
    }
    if (!response.ok) {
      throw new MusicBrainzError(`MusicBrainz API error: ${response.status}`, response.status);
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

export async function lookupMusicBrainzByIsrc(isrc: string): Promise<MusicBrainzRecording[]> {
  try {
    const response = await executeWithCircuitBreaker(async () => {
      return musicBrainzRequest<{ recordings: MusicBrainzRecording[] }>(
        `/isrc/${encodeURIComponent(isrc)}?inc=artist-credits+releases`
      );
    });
    return response.recordings ?? [];
  } catch (error) {
    if (error instanceof MusicBrainzError && (error.statusCode === 404 || error.statusCode === 400)) {
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
    const recordings = await lookupMusicBrainzByIsrc(isrc);
    if (recordings.length > 0) {
      results.set(isrc.toUpperCase(), recordings[0]);
    }
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
  }
  return results;
}

export async function getMusicBrainzArtist(mbid: string): Promise<MusicBrainzArtist | null> {
  try {
    const artist = await executeWithCircuitBreaker(async () => {
      return musicBrainzRequest<MusicBrainzArtist>(
        `/artist/${encodeURIComponent(mbid)}?inc=aliases+tags+url-rels`
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

export function isMusicBrainzAvailable(): boolean {
  return musicBrainzCircuitBreaker.getState() !== 'OPEN';
}

export function getMusicBrainzStats() {
  return { configured: true, circuitBreaker: musicBrainzCircuitBreaker.getStats() };
}
