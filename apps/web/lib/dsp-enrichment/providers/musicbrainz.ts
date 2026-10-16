/**
 * MusicBrainz Provider for DSP Enrichment
 * @see https://musicbrainz.org/doc/MusicBrainz_API
 */

import 'server-only';

import { musicBrainzLookupLimiter } from '@/lib/rate-limit';
import { CallerCancellationError } from '@/lib/resilience/caller-cancellation';
import { logger } from '@/lib/utils/logger';
import { musicBrainzCircuitBreaker } from '../circuit-breakers';
import type { MusicBrainzArtist, MusicBrainzRecording } from '../types';
import {
  collectMusicBrainzCatalog,
  type MusicBrainzCatalogQuery,
  type MusicBrainzCatalogResult,
} from './musicbrainz-catalog';

const MUSICBRAINZ_API_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Jovie/1.0.0 (https://jov.ie)';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_RETRY_DELAY_MS = 5000;

export class MusicBrainzError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly errorCode?: string,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'MusicBrainzError';
  }
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 1500;

function isNonRetryableError(error: unknown): boolean {
  if (error instanceof CallerCancellationError) return true;
  if (error instanceof MusicBrainzError) {
    return (
      (error.statusCode !== undefined &&
        error.statusCode >= 400 &&
        error.statusCode < 500 &&
        error.statusCode !== 408) ||
      error.errorCode === 'INVALID_RESPONSE' ||
      error.errorCode === 'RESPONSE_TOO_LARGE'
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
  signal?: AbortSignal,
  maxRetries = DEFAULT_MAX_RETRIES,
  baseDelayMs = DEFAULT_BASE_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (signal?.aborted) throw new CallerCancellationError();
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (isNonRetryableError(error)) throw error;
      if (attempt >= maxRetries) throw lastError;
      // Bounded retry backoff required by MusicBrainz API terms of use (1 req/sec).
      // Each wait is capped at 5s; at most two retries acquire fresh quota.
      const delayMs = Math.max(
        calculateBackoffDelay(attempt, baseDelayMs),
        error instanceof MusicBrainzError ? (error.retryAfterMs ?? 0) : 0
      );
      // Long provider cooldowns belong to durable scheduling, not a request wait.
      if (delayMs > MAX_RETRY_DELAY_MS) throw lastError;
      await waitForMusicBrainz(delayMs, signal);
    }
  }
  throw lastError ?? new Error('Unknown retry failure');
}

function waitForMusicBrainz(
  delayMs: number,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) return Promise.reject(new CallerCancellationError());
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new CallerCancellationError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('retry-after')?.trim();
  if (!value) return undefined;
  const delay = /^\d+$/.test(value)
    ? Number(value) * 1000
    : /^[A-Za-z]{3},/.test(value)
      ? Date.parse(value) - Date.now()
      : NaN;
  return Number.isFinite(delay) && delay >= 0 ? delay : undefined;
}

/** Bound decoded bytes even when Content-Length is missing or misleading. */
async function readMusicBrainzJson<T>(
  response: Response,
  signal: AbortSignal
): Promise<T> {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    throw new MusicBrainzError(
      'MusicBrainz response too large',
      undefined,
      'RESPONSE_TOO_LARGE'
    );
  }
  const reader = response.body?.getReader();
  if (!reader)
    throw new MusicBrainzError(
      'Empty MusicBrainz response',
      undefined,
      'INVALID_RESPONSE'
    );
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        throw new MusicBrainzError(
          'MusicBrainz response too large',
          undefined,
          'RESPONSE_TOO_LARGE'
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text + decoder.decode());
    } catch {
      throw new MusicBrainzError(
        'Malformed MusicBrainz JSON',
        undefined,
        'INVALID_RESPONSE'
      );
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new MusicBrainzError(
        'Invalid MusicBrainz JSON object',
        undefined,
        'INVALID_RESPONSE'
      );
    }
    return payload as T;
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
}

async function musicBrainzRequest<T>(
  endpoint: string,
  waitForQuota = false,
  signal?: AbortSignal,
  onResponse?: (response: Response) => void
): Promise<T> {
  if (signal?.aborted) throw new CallerCancellationError();
  let limitResult = await musicBrainzLookupLimiter.limit('musicbrainz:global');
  if (signal?.aborted) throw new CallerCancellationError();
  const waitMs = limitResult.reset.getTime() - Date.now() + 25;
  // Chained identity reads may wait one quota window, then ask the same
  // distributed limiter again. Outages and upstream 429s still fail closed.
  if (
    waitForQuota &&
    !limitResult.success &&
    !limitResult.unavailable &&
    limitResult.backend !== 'unavailable' &&
    waitMs > 0 &&
    waitMs <= 1100
  ) {
    await waitForMusicBrainz(waitMs, signal);
    if (signal?.aborted) throw new CallerCancellationError();
    limitResult = await musicBrainzLookupLimiter.limit('musicbrainz:global');
  }
  if (signal?.aborted) throw new CallerCancellationError();
  if (!limitResult.success) {
    throw new MusicBrainzError(
      limitResult.reason ?? 'Rate limit exceeded',
      429,
      'RATE_LIMITED',
      Math.max(0, limitResult.reset.getTime() - Date.now())
    );
  }

  const url = `${MUSICBRAINZ_API_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}fmt=json`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const requestSignal = signal
    ? AbortSignal.any([controller.signal, signal])
    : controller.signal;
  let response: Response | undefined;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: requestSignal,
    });
    if (response.status === 503 || response.status === 429) {
      throw new MusicBrainzError(
        'Rate limit exceeded',
        response.status,
        'RATE_LIMITED',
        retryAfterMs(response)
      );
    }
    if (!response.ok) {
      throw new MusicBrainzError(
        `MusicBrainz API error: ${response.status}`,
        response.status
      );
    }
    onResponse?.(response);
    const payload = await readMusicBrainzJson<T>(response, requestSignal);
    if (signal?.aborted) throw new CallerCancellationError();
    return payload;
  } catch (error) {
    if (error instanceof MusicBrainzError) throw error;
    if (signal?.aborted) throw new CallerCancellationError();
    if (
      controller.signal.aborted ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw new MusicBrainzError('Request timeout', undefined, 'TIMEOUT');
    }
    throw new MusicBrainzError(
      `MusicBrainz request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    clearTimeout(timeoutId);
    if (response?.body && !response.body.locked)
      void response.body.cancel().catch(() => {});
  }
}

async function executeWithCircuitBreaker<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  return musicBrainzCircuitBreaker.execute(() => withRetry(fn, signal));
}

/** Uses the existing distributed quota and breaker; no vendor or new cache. */
export async function browseMusicBrainzCatalog(
  options: MusicBrainzCatalogQuery
): Promise<MusicBrainzCatalogResult> {
  const deadline = AbortSignal.timeout(30_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadline])
    : deadline;
  try {
    return await collectMusicBrainzCatalog({ ...options, signal }, endpoint =>
      executeWithCircuitBreaker(
        () => musicBrainzRequest<unknown>(endpoint, true, signal),
        signal
      )
    );
  } catch (error) {
    if (deadline.aborted && !options.signal?.aborted) {
      throw new MusicBrainzError(
        'Catalog traversal timeout',
        undefined,
        'TIMEOUT'
      );
    }
    throw error;
  }
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
  mbid: string,
  options: {
    includeReleaseGroups?: boolean | 'all';
    maxCatalogPages?: number;
    waitForQuota?: boolean;
    signal?: AbortSignal;
  } = {}
): Promise<MusicBrainzArtist | null> {
  if (!isMusicBrainzId(mbid)) return null;
  const normalizedId = mbid.toLowerCase();
  let response: Response | undefined;
  let artist: MusicBrainzArtist;
  try {
    const includes =
      options.includeReleaseGroups === 'all'
        ? 'aliases+url-rels'
        : `aliases+tags+genres+url-rels${options.includeReleaseGroups ? '+release-groups' : ''}`;
    artist = await executeWithCircuitBreaker(async () => {
      return musicBrainzRequest<MusicBrainzArtist>(
        `/artist/${normalizedId}?inc=${includes}`,
        options.waitForQuota,
        options.signal,
        value => {
          response = value;
        }
      );
    }, options.signal);
    const responseId = musicBrainzResponseId(response, normalizedId, 'artist');
    if (!responseId || artist.id !== responseId || !artist.name?.trim()) {
      throw new MusicBrainzError(
        'Mismatched artist response',
        502,
        'INVALID_RESPONSE'
      );
    }
  } catch (error) {
    if (error instanceof MusicBrainzError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
  if (options.includeReleaseGroups === 'all') {
    const catalog = await browseMusicBrainzCatalog({
      entity: 'release-group',
      by: 'artist',
      mbid: artist.id,
      maxPages: options.maxCatalogPages,
      signal: options.signal,
    });
    return {
      ...artist,
      'release-groups': [...catalog.items],
      releaseGroupsComplete: catalog.complete,
    };
  }
  // This Jovie receipt must never be accepted from a raw upstream payload.
  return { ...artist, releaseGroupsComplete: undefined };
}

export function isMusicBrainzId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

/** Merged MBIDs are aliases only when the upstream canonical URL proves it. */
function musicBrainzResponseId(
  response: Response | undefined,
  requestedId: string,
  kind: 'artist' | 'release'
): string | null {
  if (!response?.redirected) return requestedId;
  try {
    const url = new URL(response.url);
    const prefix = `/ws/2/${kind}/`;
    const id = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length)
      : '';
    if (
      url.origin !== 'https://musicbrainz.org' ||
      url.username ||
      url.password ||
      !isMusicBrainzId(id)
    )
      return null;
    return id.toLowerCase();
  } catch {
    return null;
  }
}

/** Exact indexed URL relations, never a display-name or SERP guess. */
export async function lookupMusicBrainzArtistsByUrl(
  resource: string,
  signal?: AbortSignal
): Promise<MusicBrainzArtist[]> {
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return [];
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    return [];
  const resources = musicBrainzArtistResources(url);
  interface UrlRelations {
    resource?: string;
    relations?: MusicBrainzArtist['relations'];
  }
  let response: UrlRelations & { urls?: UrlRelations[] };
  try {
    response = await executeWithCircuitBreaker(
      () =>
        musicBrainzRequest(
          `/url?${resources.map(value => `resource=${encodeURIComponent(value)}`).join('&')}&inc=artist-rels`,
          false,
          signal
        ),
      signal
    );
  } catch (error) {
    if (error instanceof MusicBrainzError && error.statusCode === 404)
      return [];
    throw error;
  }
  const hits = response.urls ?? [response];
  if (hits.some(hit => !hit.resource || !resources.includes(hit.resource))) {
    throw new MusicBrainzError(
      'Mismatched URL response',
      502,
      'INVALID_RESPONSE'
    );
  }
  return [
    ...new Map(
      hits
        .flatMap(hit => hit.relations ?? [])
        .flatMap(relation => {
          const artist = relation.artist;
          return !relation.ended &&
            artist &&
            isMusicBrainzId(artist.id) &&
            artist.name?.trim()
            ? [
                [
                  artist.id.toLowerCase(),
                  { ...artist, id: artist.id.toLowerCase() },
                ] as const,
              ]
            : [];
        })
    ).values(),
  ];
}

/** Provider IDs survive share parameters, Spotify locales and Apple URL aliases. */
function musicBrainzArtistResources(url: URL): string[] {
  if (url.hostname === 'open.spotify.com') {
    const artistPath = url.pathname.replace(
      /^\/intl-([a-z]+(?:-[a-z]+)*)\//,
      '/'
    );
    const id = /^\/artist\/([A-Za-z0-9]{22})\/?$/.exec(artistPath)?.[1];
    if (id) return [`https://open.spotify.com/artist/${id}`];
  }
  if (['music.apple.com', 'itunes.apple.com'].includes(url.hostname)) {
    const artist = /^\/([a-z]{2})\/artist\/(?:[^/]+\/)?(?:id)?(\d+)\/?$/.exec(
      url.pathname
    );
    if (artist)
      return [
        ...new Set([
          `${url.origin}${url.pathname.replace(/\/$/, '')}`,
          `https://music.apple.com/${artist[1]}/artist/${artist[2]}`,
          `https://itunes.apple.com/${artist[1]}/artist/id${artist[2]}`,
        ]),
      ];
  }
  return [url.href];
}

interface MusicBrainzNamedSearchHit {
  id?: string;
  name?: string;
  title?: string;
  barcode?: string;
  score?: number;
}

function exactName(left: string, right: string): boolean {
  const normalize = (value: string) => {
    if (!/[\p{L}\p{N}]/u.test(value)) return '';
    return value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
      .trim();
  };
  const key = normalize(left);
  return key.length > 0 && key === normalize(right);
}

/**
 * Name search, then url-rels only when one artist name matches exactly.
 * Several exact names stay unresolved here so the caller can ask for a choice.
 */
export async function matchMusicBrainzArtistByName(
  name: string,
  signal?: AbortSignal
): Promise<
  | { status: 'found'; artist: MusicBrainzArtist }
  | { status: 'ambiguous'; count: number; artists: MusicBrainzArtist[] }
  | { status: 'none' }
> {
  const trimmed = name.trim();
  if (!trimmed) return { status: 'none' };
  const response = await executeWithCircuitBreaker(() =>
    musicBrainzRequest<{ artists?: MusicBrainzNamedSearchHit[] }>(
      `/artist?query=${encodeURIComponent(`artist:"${trimmed.replace(/["\\]/g, ' ')}"`)}&limit=5`,
      false,
      signal
    )
  );
  const exact = (response.artists ?? []).filter(
    hit =>
      hit.id &&
      isMusicBrainzId(hit.id) &&
      hit.name &&
      exactName(hit.name, trimmed)
  );
  const unique = [
    ...new Map(exact.map(hit => [hit.id!.toLowerCase(), hit])).values(),
  ];
  if (unique.length > 1)
    return {
      status: 'ambiguous',
      count: unique.length,
      artists: unique.map(hit => ({
        id: hit.id!.toLowerCase(),
        name: hit.name!,
      })),
    };
  const only = unique[0];
  if (!only?.id) return { status: 'none' };
  const artist = await getMusicBrainzArtist(only.id, {
    waitForQuota: true,
    includeReleaseGroups: true,
    signal,
  });
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
    release =>
      release.id &&
      isMusicBrainzId(release.id) &&
      release.barcode?.replace(/\D/g, '') === digits
  );
  const releaseId = hit?.id?.toLowerCase();
  if (!releaseId) return null;
  let detailResponse: Response | undefined;
  const release = await executeWithCircuitBreaker(() =>
    musicBrainzRequest<{
      id?: string;
      title?: string;
      barcode?: string;
      relations?: MusicBrainzArtist['relations'];
      'artist-credit'?: Array<{ name?: string; artist?: { name?: string } }>;
    }>(
      `/release/${encodeURIComponent(releaseId)}?inc=artist-credits+url-rels`,
      true,
      undefined,
      value => {
        detailResponse = value;
      }
    )
  );
  const responseId = musicBrainzResponseId(
    detailResponse,
    releaseId,
    'release'
  );
  if (
    !responseId ||
    release.id !== responseId ||
    release.barcode?.replace(/\D/g, '') !== digits
  ) {
    throw new MusicBrainzError(
      'Mismatched release response',
      502,
      'INVALID_RESPONSE'
    );
  }
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
