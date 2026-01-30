/**
 * Deezer Provider for DSP Enrichment
 *
 * Provides artist profile enrichment including profile photos and names.
 * Uses Deezer public API (no authentication required).
 *
 * Features:
 * - Artist profile lookup by ID
 * - Artist search by name
 * - ISRC-based track lookups
 * - Profile image extraction with multiple sizes
 * - Circuit breaker protection
 *
 * @see https://developers.deezer.com/api
 */

import 'server-only';

import { deezerCircuitBreaker } from '../circuit-breakers';
import type { DeezerArtist, DeezerTrack, DspImageUrls } from '../types';

// ============================================================================
// Configuration
// ============================================================================

const DEEZER_API_BASE = 'https://api.deezer.com';

/**
 * Request timeout in milliseconds
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Maximum search results
 */
const MAX_SEARCH_LIMIT = 25;

// ============================================================================
// Types
// ============================================================================

export interface DeezerEnrichedArtist {
  id: number;
  name: string;
  url: string;
  imageUrls: DspImageUrls | null;
  followers: number | null;
  albumCount: number | null;
}

interface DeezerSearchResponse<T> {
  data: T[];
  total: number;
  next?: string;
}

interface DeezerApiErrorResponse {
  error: {
    type: string;
    message: string;
    code: number;
  };
}

// ============================================================================
// Error Classes
// ============================================================================

export class DeezerError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = 'DeezerError';
  }
}

// ============================================================================
// Retry Logic
// ============================================================================

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 1000;

function isNonRetryableError(error: unknown): boolean {
  if (error instanceof DeezerError) {
    return error.statusCode === 404;
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

// ============================================================================
// HTTP Client
// ============================================================================

async function deezerRequest<T>(endpoint: string): Promise<T> {
  const url = `${DEEZER_API_BASE}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new DeezerError(
        `Deezer API error: ${response.status}`,
        response.status
      );
    }

    const data = await response.json();

    // Deezer returns errors in the response body, not via HTTP status
    if (data.error) {
      const apiError = data as DeezerApiErrorResponse;
      throw new DeezerError(
        apiError.error.message,
        apiError.error.code,
        apiError.error.type
      );
    }

    return data as T;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof DeezerError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new DeezerError('Request timeout', undefined, 'TIMEOUT');
    }

    throw new DeezerError(
      `Deezer request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

async function executeWithCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
  return deezerCircuitBreaker.execute(() => withRetry(fn));
}

// ============================================================================
// Artist Operations
// ============================================================================

/**
 * Get artist profile by Deezer ID.
 *
 * @param artistId - Deezer artist ID (numeric)
 * @returns Artist profile or null if not found
 */
export async function getDeezerArtist(
  artistId: string | number
): Promise<DeezerArtist | null> {
  try {
    const artist = await executeWithCircuitBreaker(async () => {
      return deezerRequest<DeezerArtist>(`/artist/${artistId}`);
    });
    return artist;
  } catch (error) {
    if (error instanceof DeezerError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Search for artists by name.
 *
 * @param query - Artist name to search
 * @param limit - Maximum results (default 10, max 25)
 * @returns Array of matching artists
 */
export async function searchDeezerArtist(
  query: string,
  limit = 10
): Promise<DeezerArtist[]> {
  const safeLimit = Math.min(limit, MAX_SEARCH_LIMIT);

  try {
    const response = await executeWithCircuitBreaker(async () => {
      return deezerRequest<DeezerSearchResponse<DeezerArtist>>(
        `/search/artist?q=${encodeURIComponent(query)}&limit=${safeLimit}`
      );
    });
    return response.data ?? [];
  } catch {
    return [];
  }
}

// ============================================================================
// Track Operations
// ============================================================================

/**
 * Search for a track by ISRC.
 *
 * @param isrc - International Standard Recording Code
 * @returns Track or null if not found
 */
export async function lookupDeezerByIsrc(
  isrc: string
): Promise<DeezerTrack | null> {
  try {
    const response = await executeWithCircuitBreaker(async () => {
      return deezerRequest<DeezerSearchResponse<DeezerTrack>>(
        `/search/track?q=isrc:${encodeURIComponent(isrc)}&limit=1`
      );
    });
    return response.data?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Bulk lookup tracks by ISRC.
 * Note: Deezer doesn't support batch ISRC lookups, so we process sequentially.
 *
 * @param isrcs - Array of ISRCs
 * @returns Map of ISRC to track
 */
export async function bulkLookupDeezerByIsrc(
  isrcs: string[]
): Promise<Map<string, DeezerTrack>> {
  const results = new Map<string, DeezerTrack>();

  // Process sequentially to respect rate limits
  for (const isrc of isrcs) {
    const track = await lookupDeezerByIsrc(isrc);
    if (track) {
      results.set(isrc.toUpperCase(), track);
    }
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

// ============================================================================
// Image Extraction
// ============================================================================

/**
 * Extract standardized image URLs from Deezer artist.
 * Deezer provides multiple predefined sizes.
 *
 * @param artist - Deezer artist object
 * @returns Standardized image URLs or null if no images
 */
export function extractDeezerImageUrls(
  artist: DeezerArtist
): DspImageUrls | null {
  if (!artist.picture) {
    return null;
  }

  return {
    small: artist.picture_small || artist.picture,
    medium: artist.picture_medium || artist.picture,
    large: artist.picture_big || artist.picture_xl || artist.picture,
    original: artist.picture_xl || artist.picture_big || artist.picture,
  };
}

/**
 * Get the best quality image URL from Deezer artist.
 *
 * @param artist - Deezer artist object
 * @returns Highest quality image URL or null
 */
export function getBestDeezerImageUrl(artist: DeezerArtist): string | null {
  return (
    artist.picture_xl ||
    artist.picture_big ||
    artist.picture_medium ||
    artist.picture_small ||
    artist.picture ||
    null
  );
}

// ============================================================================
// Enrichment Helpers
// ============================================================================

/**
 * Convert Deezer artist to enriched format for storage.
 *
 * @param artist - Raw Deezer artist profile
 * @returns Enriched artist data
 */
export function toDeezerEnrichedArtist(
  artist: DeezerArtist
): DeezerEnrichedArtist {
  return {
    id: artist.id,
    name: artist.name,
    url: artist.link,
    imageUrls: extractDeezerImageUrls(artist),
    followers: artist.nb_fan ?? null,
    albumCount: artist.nb_album ?? null,
  };
}

// ============================================================================
// Provider Status
// ============================================================================

/**
 * Check if Deezer provider is available.
 * Deezer has no auth requirements, so it's always "configured".
 *
 * @returns True if circuit breaker is not open
 */
export function isDeezerAvailable(): boolean {
  return deezerCircuitBreaker.getState() !== 'OPEN';
}

/**
 * Get Deezer circuit breaker stats.
 */
export function getDeezerStats() {
  return {
    configured: true, // Always configured (no auth needed)
    circuitBreaker: deezerCircuitBreaker.getStats(),
  };
}
