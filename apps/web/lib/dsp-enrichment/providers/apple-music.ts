/**
 * Apple MusicKit API Provider
 *
 * MusicKit API client for artist matching and enrichment.
 * Provides ISRC lookups, artist search, and profile enrichment.
 *
 * Features:
 * - JWT authentication with token caching
 * - Batch ISRC lookups (up to 25 per request)
 * - Circuit breaker protection
 * - Rate limiting compliance (80 req/min)
 *
 * @see https://developer.apple.com/documentation/applemusicapi
 */

import 'server-only';

import * as Sentry from '@sentry/nextjs';
import {
  getCachedArtistProfile,
  getCachedIsrcTrack,
  setCachedArtistProfile,
  setCachedIsrcTrack,
} from '../cache';
import { appleMusicCircuitBreaker } from '../circuit-breakers';
import type {
  AppleMusicAlbum,
  AppleMusicArtist,
  AppleMusicTrack,
  DspImageUrls,
} from '../types';
import {
  clearAppleMusicTokenCache,
  getAppleMusicAuthHeaders,
  isAppleMusicConfigured,
} from './apple-music-auth';

// ============================================================================
// Configuration
// ============================================================================

const MUSICKIT_API_BASE = 'https://api.music.apple.com/v1';

/**
 * Default storefront (US).
 * Storefronts affect available content and URLs.
 */
export const DEFAULT_STOREFRONT = 'us';

/**
 * Maximum ISRCs per batch request (Apple's limit is 25)
 */
export const MAX_ISRC_BATCH_SIZE = 25;

/**
 * Request timeout in milliseconds
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Maximum search results limit (Apple's limit is 25)
 */
const MAX_SEARCH_LIMIT = 25;

/**
 * Default number of search results to return
 */
const DEFAULT_SEARCH_LIMIT = 10;

/**
 * Default number of albums to fetch per artist
 */
const DEFAULT_ALBUMS_LIMIT = 50;

// ============================================================================
// Types
// ============================================================================

interface MusicKitResponse<T> {
  data?: T[];
  results?: {
    songs?: { data: T[] };
    artists?: { data: T[] };
    albums?: { data: T[] };
  };
  errors?: Array<{
    id: string;
    title: string;
    detail: string;
    status: string;
    code: string;
  }>;
  next?: string;
}

interface AppleMusicProviderOptions {
  storefront?: string;
  fetcher?: typeof fetch;
}

// ============================================================================
// Error Classes
// ============================================================================

export class AppleMusicError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = 'AppleMusicError';
  }
}

export class AppleMusicNotConfiguredError extends Error {
  constructor() {
    super(
      'Apple Music credentials not configured. Set APPLE_MUSIC_KEY_ID, APPLE_MUSIC_TEAM_ID, and APPLE_MUSIC_PRIVATE_KEY.'
    );
    this.name = 'AppleMusicNotConfiguredError';
  }
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Default retry configuration
 */
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 1000;

/**
 * Check if an error should not be retried.
 */
function isNonRetryableError(error: unknown): boolean {
  if (error instanceof AppleMusicNotConfiguredError) return true;
  if (error instanceof AppleMusicError) {
    return error.statusCode === 401 || error.statusCode === 404;
  }
  return false;
}

/**
 * Calculate exponential backoff delay with jitter.
 */
function calculateBackoffDelay(attempt: number, baseDelayMs: number): number {
  const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15x
  return baseDelayMs * Math.pow(2, attempt) * jitter;
}

/**
 * Retry wrapper with exponential backoff for transient failures.
 * Does not retry on auth errors (401) or not found (404).
 */
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

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error('Unknown retry failure');
}

// ============================================================================
// HTTP Client
// ============================================================================

/**
 * Make an authenticated request to the MusicKit API.
 * Automatically retries once on 401 errors after refreshing the token.
 */
async function musicKitRequest<T>(
  endpoint: string,
  options: AppleMusicProviderOptions = {},
  isRetry = false
): Promise<MusicKitResponse<T>> {
  if (!isAppleMusicConfigured()) {
    throw new AppleMusicNotConfiguredError();
  }

  const fetcher = options.fetcher ?? fetch;
  const url = `${MUSICKIT_API_BASE}${endpoint}`;

  const headers = await getAppleMusicAuthHeaders();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetcher(url, {
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle auth errors - clear token cache and retry once
    if (response.status === 401) {
      clearAppleMusicTokenCache();

      // Retry once with fresh token
      if (!isRetry) {
        Sentry.addBreadcrumb({
          category: 'apple-music-provider',
          message: '401 received, retrying with fresh token',
          level: 'warning',
          data: { endpoint },
        });
        return musicKitRequest<T>(endpoint, options, true);
      }

      throw new AppleMusicError('Authentication failed', 401, 'UNAUTHORIZED');
    }

    if (response.status === 429) {
      throw new AppleMusicError('Rate limit exceeded', 429, 'RATE_LIMITED');
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AppleMusicError(
        `MusicKit API error: ${response.status} ${errorBody}`,
        response.status
      );
    }

    return (await response.json()) as MusicKitResponse<T>;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof AppleMusicError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppleMusicError('Request timeout', undefined, 'TIMEOUT');
    }

    throw new AppleMusicError(
      `MusicKit request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Execute a MusicKit request with circuit breaker protection and retry logic.
 * Retries transient failures with exponential backoff before opening circuit.
 */
async function executeWithCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
  return appleMusicCircuitBreaker.execute(() => withRetry(fn));
}

// ============================================================================
// ISRC Lookups
// ============================================================================

/**
 * Look up a single track by ISRC.
 *
 * @param isrc - International Standard Recording Code
 * @param options - Provider options (storefront, fetcher)
 * @returns The matching track or null if not found
 */
export async function lookupByIsrc(
  isrc: string,
  options: AppleMusicProviderOptions = {}
): Promise<AppleMusicTrack | null> {
  const storefront = options.storefront ?? DEFAULT_STOREFRONT;

  const result = await executeWithCircuitBreaker(async () => {
    const response = await musicKitRequest<AppleMusicTrack>(
      `/catalog/${storefront}/songs?filter[isrc]=${encodeURIComponent(isrc)}`,
      options
    );
    return response;
  });

  return result.data?.[0] ?? null;
}

/**
 * Look up multiple tracks by ISRC in a single batch request.
 * Apple Music supports up to 25 ISRCs per request.
 *
 * @param isrcs - Array of ISRCs (max 25)
 * @param options - Provider options
 * @returns Map of ISRC to track (only includes found tracks)
 */
export async function bulkLookupByIsrc(
  isrcs: string[],
  options: AppleMusicProviderOptions = {}
): Promise<Map<string, AppleMusicTrack>> {
  if (isrcs.length === 0) {
    return new Map();
  }

  if (isrcs.length > MAX_ISRC_BATCH_SIZE) {
    throw new Error(
      `Cannot lookup more than ${MAX_ISRC_BATCH_SIZE} ISRCs in a single request. Got ${isrcs.length}.`
    );
  }

  const trackMap = new Map<string, AppleMusicTrack>();
  const uncachedIsrcs: string[] = [];

  // Check cache first for each ISRC
  for (const isrc of isrcs) {
    const cached = getCachedIsrcTrack<AppleMusicTrack>(isrc);
    if (cached) {
      trackMap.set(isrc.toUpperCase(), cached);
    } else {
      uncachedIsrcs.push(isrc);
    }
  }

  // If all ISRCs were cached, return early
  if (uncachedIsrcs.length === 0) {
    return trackMap;
  }

  const storefront = options.storefront ?? DEFAULT_STOREFRONT;

  // Apple Music accepts comma-separated ISRCs
  const isrcParam = uncachedIsrcs.map(i => encodeURIComponent(i)).join(',');

  const result = await executeWithCircuitBreaker(async () => {
    const response = await musicKitRequest<AppleMusicTrack>(
      `/catalog/${storefront}/songs?filter[isrc]=${isrcParam}`,
      options
    );
    return response;
  });

  if (result.data) {
    for (const track of result.data) {
      const trackIsrc = track.attributes?.isrc;
      if (trackIsrc) {
        const normalizedIsrc = trackIsrc.toUpperCase();
        trackMap.set(normalizedIsrc, track);
        // Cache the result for future lookups
        setCachedIsrcTrack(normalizedIsrc, track);
      }
    }
  }

  return trackMap;
}

/**
 * Look up an album by UPC.
 *
 * @param upc - Universal Product Code
 * @param options - Provider options
 * @returns The matching album or null if not found
 */
export async function lookupByUpc(
  upc: string,
  options: AppleMusicProviderOptions = {}
): Promise<AppleMusicAlbum | null> {
  const storefront = options.storefront ?? DEFAULT_STOREFRONT;

  const result = await executeWithCircuitBreaker(async () => {
    const response = await musicKitRequest<AppleMusicAlbum>(
      `/catalog/${storefront}/albums?filter[upc]=${encodeURIComponent(upc)}`,
      options
    );
    return response;
  });

  return result.data?.[0] ?? null;
}

// ============================================================================
// Artist Operations
// ============================================================================

/**
 * Get artist by Apple Music ID with full enrichment data.
 *
 * @param artistId - Apple Music artist ID
 * @param options - Provider options
 * @returns Artist with enrichment data or null if not found
 */
export async function getArtist(
  artistId: string,
  options: AppleMusicProviderOptions = {}
): Promise<AppleMusicArtist | null> {
  // Check cache first
  const cached = getCachedArtistProfile<AppleMusicArtist>(artistId);
  if (cached) {
    return cached;
  }

  const storefront = options.storefront ?? DEFAULT_STOREFRONT;

  const result = await executeWithCircuitBreaker(async () => {
    // Include albums relationship for additional data
    const response = await musicKitRequest<AppleMusicArtist>(
      `/catalog/${storefront}/artists/${artistId}?include=albums`,
      options
    );
    return response;
  });

  const artist = result.data?.[0] ?? null;

  // Cache the result for future lookups
  if (artist) {
    setCachedArtistProfile(artistId, artist);
  }

  return artist;
}

/**
 * Search for artists by name.
 *
 * @param query - Artist name to search
 * @param options - Provider options
 * @param limit - Maximum results (default 10, max 25)
 * @returns Array of matching artists
 */
export async function searchArtist(
  query: string,
  options: AppleMusicProviderOptions = {},
  limit = DEFAULT_SEARCH_LIMIT
): Promise<AppleMusicArtist[]> {
  const storefront = options.storefront ?? DEFAULT_STOREFRONT;
  const safeLimit = Math.min(limit, MAX_SEARCH_LIMIT);

  const result = await executeWithCircuitBreaker(async () => {
    const response = await musicKitRequest<AppleMusicArtist>(
      `/catalog/${storefront}/search?types=artists&term=${encodeURIComponent(query)}&limit=${safeLimit}`,
      options
    );
    return response;
  });

  return result.results?.artists?.data ?? [];
}

/**
 * Get album by Apple Music ID.
 *
 * @param albumId - Apple Music album ID
 * @param options - Provider options
 * @returns The album or null if not found
 */
export async function getAlbum(
  albumId: string,
  options: AppleMusicProviderOptions = {}
): Promise<AppleMusicAlbum | null> {
  const storefront = options.storefront ?? DEFAULT_STOREFRONT;

  const result = await executeWithCircuitBreaker(async () => {
    const response = await musicKitRequest<AppleMusicAlbum>(
      `/catalog/${storefront}/albums/${albumId}`,
      options
    );
    return response;
  });

  return result.data?.[0] ?? null;
}

/**
 * Get artist's albums.
 *
 * @param artistId - Apple Music artist ID
 * @param options - Provider options
 * @param limit - Maximum results (default 50)
 * @returns Array of albums
 */
export async function getArtistAlbums(
  artistId: string,
  options: AppleMusicProviderOptions = {},
  limit = DEFAULT_ALBUMS_LIMIT
): Promise<AppleMusicAlbum[]> {
  const storefront = options.storefront ?? DEFAULT_STOREFRONT;

  const result = await executeWithCircuitBreaker(async () => {
    const response = await musicKitRequest<AppleMusicAlbum>(
      `/catalog/${storefront}/artists/${artistId}/albums?limit=${limit}`,
      options
    );
    return response;
  });

  return result.data ?? [];
}

// ============================================================================
// Enrichment Helpers
// ============================================================================

/**
 * Extract image URLs from Apple Music artwork.
 * Apple Music uses templated URLs with {w} and {h} placeholders.
 *
 * @param artwork - Apple Music artwork object
 * @returns Standardized image URLs for different sizes
 */
export function extractImageUrls(artwork?: {
  url: string;
  width: number;
  height: number;
}): DspImageUrls | null {
  if (!artwork?.url) {
    return null;
  }

  const template = artwork.url;

  return {
    small: template.replace('{w}', '150').replace('{h}', '150'),
    medium: template.replace('{w}', '300').replace('{h}', '300'),
    large: template.replace('{w}', '600').replace('{h}', '600'),
    original: template
      .replace('{w}', String(artwork.width))
      .replace('{h}', String(artwork.height)),
  };
}

/**
 * Extract external URLs from an Apple Music artist.
 *
 * @param artist - Apple Music artist object
 * @returns Object with platform URLs (null for missing or empty URLs)
 */
export function extractExternalUrls(artist: AppleMusicArtist): {
  apple_music: string | null;
} {
  const url = artist.attributes?.url;
  return {
    // Return null for missing or empty URLs (not just nullish)
    apple_music: url && url.trim() !== '' ? url : null,
  };
}

/**
 * Extract bio from Apple Music editorial notes.
 *
 * @param artist - Apple Music artist object
 * @returns Bio text or null
 */
export function extractBio(artist: AppleMusicArtist): string | null {
  const notes = artist.attributes?.editorialNotes;
  return notes?.standard ?? notes?.short ?? null;
}

// ============================================================================
// Provider Status
// ============================================================================

/**
 * Check if Apple Music provider is available.
 *
 * @returns True if configured and circuit breaker is not open
 */
export function isAppleMusicAvailable(): boolean {
  return (
    isAppleMusicConfigured() && appleMusicCircuitBreaker.getState() !== 'OPEN'
  );
}

/**
 * Get Apple Music circuit breaker stats.
 */
export function getAppleMusicStats() {
  return {
    configured: isAppleMusicConfigured(),
    circuitBreaker: appleMusicCircuitBreaker.getStats(),
  };
}
