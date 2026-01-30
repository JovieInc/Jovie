/**
 * Spotify Provider for DSP Enrichment
 *
 * Provides artist profile enrichment including profile photos and names.
 * Uses Spotify Web API for artist data retrieval.
 *
 * Features:
 * - Artist profile lookup by ID
 * - Profile image extraction with multiple sizes
 * - Follower count and genre data
 * - Circuit breaker protection
 *
 * @see https://developer.spotify.com/documentation/web-api
 */

import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { env } from '@/lib/env-server';
import { spotifyCircuitBreaker } from '@/lib/spotify/circuit-breaker';
import type { DspImageUrls } from '../types';

// ============================================================================
// Configuration
// ============================================================================

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_CLIENT_ID = env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = env.SPOTIFY_CLIENT_SECRET;

/**
 * Request timeout in milliseconds
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Token cache for client credentials flow
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

// ============================================================================
// Types
// ============================================================================

export interface SpotifyArtistProfile {
  id: string;
  name: string;
  images: Array<{ url: string; height: number; width: number }>;
  followers: { total: number };
  popularity: number;
  genres: string[];
  external_urls: { spotify: string };
  uri: string;
}

export interface SpotifyEnrichedArtist {
  id: string;
  name: string;
  url: string;
  imageUrls: DspImageUrls | null;
  followers: number;
  popularity: number;
  genres: string[];
}

// ============================================================================
// Error Classes
// ============================================================================

export class SpotifyError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = 'SpotifyError';
  }
}

export class SpotifyNotConfiguredError extends Error {
  constructor() {
    super(
      'Spotify credentials not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.'
    );
    this.name = 'SpotifyNotConfiguredError';
  }
}

// ============================================================================
// Authentication
// ============================================================================

/**
 * Check if Spotify is configured
 */
export function isSpotifyConfigured(): boolean {
  return Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET);
}

/**
 * Get access token using client credentials flow.
 * Tokens are cached until expiry.
 */
async function getAccessToken(): Promise<string> {
  if (!isSpotifyConfigured()) {
    throw new SpotifyNotConfiguredError();
  }

  // Check cache
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new SpotifyError('Failed to obtain access token', response.status);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

/**
 * Clear token cache (for testing or error recovery)
 */
export function clearSpotifyTokenCache(): void {
  cachedToken = null;
}

// ============================================================================
// Retry Logic
// ============================================================================

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 1000;

function isNonRetryableError(error: unknown): boolean {
  if (error instanceof SpotifyNotConfiguredError) return true;
  if (error instanceof SpotifyError) {
    return error.statusCode === 401 || error.statusCode === 404;
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

async function spotifyRequest<T>(
  endpoint: string,
  isRetry = false
): Promise<T> {
  if (!isSpotifyConfigured()) {
    throw new SpotifyNotConfiguredError();
  }

  const token = await getAccessToken();
  const url = `${SPOTIFY_API_BASE}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle auth errors - clear token cache and retry once
    if (response.status === 401) {
      clearSpotifyTokenCache();

      if (!isRetry) {
        Sentry.addBreadcrumb({
          category: 'spotify-provider',
          message: '401 received, retrying with fresh token',
          level: 'warning',
          data: { endpoint },
        });
        return spotifyRequest<T>(endpoint, true);
      }

      throw new SpotifyError('Authentication failed', 401, 'UNAUTHORIZED');
    }

    if (response.status === 429) {
      throw new SpotifyError('Rate limit exceeded', 429, 'RATE_LIMITED');
    }

    if (response.status === 404) {
      throw new SpotifyError('Artist not found', 404, 'NOT_FOUND');
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new SpotifyError(
        `Spotify API error: ${response.status} ${errorBody}`,
        response.status
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof SpotifyError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new SpotifyError('Request timeout', undefined, 'TIMEOUT');
    }

    throw new SpotifyError(
      `Spotify request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

async function executeWithCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
  return spotifyCircuitBreaker.execute(() => withRetry(fn));
}

// ============================================================================
// Artist Operations
// ============================================================================

/**
 * Get artist profile by Spotify ID.
 *
 * @param artistId - Spotify artist ID
 * @returns Artist profile or null if not found
 */
export async function getSpotifyArtistProfile(
  artistId: string
): Promise<SpotifyArtistProfile | null> {
  try {
    const artist = await executeWithCircuitBreaker(async () => {
      return spotifyRequest<SpotifyArtistProfile>(`/artists/${artistId}`);
    });
    return artist;
  } catch (error) {
    if (error instanceof SpotifyError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get multiple artists by IDs (max 50 per request).
 *
 * @param artistIds - Array of Spotify artist IDs
 * @returns Array of artist profiles
 */
export async function getSpotifyArtists(
  artistIds: string[]
): Promise<SpotifyArtistProfile[]> {
  if (artistIds.length === 0) {
    return [];
  }

  // Spotify allows max 50 artists per request
  const chunks: string[][] = [];
  for (let i = 0; i < artistIds.length; i += 50) {
    chunks.push(artistIds.slice(i, i + 50));
  }

  const allArtists: SpotifyArtistProfile[] = [];

  for (const chunk of chunks) {
    try {
      const response = await executeWithCircuitBreaker(async () => {
        return spotifyRequest<{ artists: SpotifyArtistProfile[] }>(
          `/artists?ids=${chunk.join(',')}`
        );
      });
      allArtists.push(...response.artists.filter(Boolean));
    } catch {
      // Continue with other chunks if one fails
    }
  }

  return allArtists;
}

// ============================================================================
// Image Extraction
// ============================================================================

/**
 * Extract standardized image URLs from Spotify artist images.
 * Spotify provides images in various sizes; we standardize to our format.
 *
 * @param images - Array of Spotify image objects
 * @returns Standardized image URLs or null if no images
 */
export function extractSpotifyImageUrls(
  images: SpotifyArtistProfile['images']
): DspImageUrls | null {
  if (!images || images.length === 0) {
    return null;
  }

  // Sort by height descending
  const sorted = [...images].sort((a, b) => (b.height || 0) - (a.height || 0));

  // Find best matches for each size
  const findClosest = (targetSize: number) => {
    return sorted.reduce((prev, curr) => {
      const prevDiff = Math.abs((prev.height || 0) - targetSize);
      const currDiff = Math.abs((curr.height || 0) - targetSize);
      return currDiff < prevDiff ? curr : prev;
    });
  };

  return {
    small: findClosest(150).url,
    medium: findClosest(300).url,
    large: findClosest(600).url,
    original: sorted[0]?.url ?? sorted[sorted.length - 1]?.url,
  };
}

/**
 * Get the best quality image URL from Spotify images.
 *
 * @param images - Array of Spotify image objects
 * @returns Highest quality image URL or null
 */
export function getBestSpotifyImageUrl(
  images: SpotifyArtistProfile['images']
): string | null {
  if (!images || images.length === 0) {
    return null;
  }

  const sorted = [...images].sort((a, b) => (b.height || 0) - (a.height || 0));
  return sorted[0]?.url ?? null;
}

// ============================================================================
// Enrichment Helpers
// ============================================================================

/**
 * Convert Spotify artist to enriched format for storage.
 *
 * @param artist - Raw Spotify artist profile
 * @returns Enriched artist data
 */
export function toEnrichedArtist(
  artist: SpotifyArtistProfile
): SpotifyEnrichedArtist {
  return {
    id: artist.id,
    name: artist.name,
    url: artist.external_urls.spotify,
    imageUrls: extractSpotifyImageUrls(artist.images),
    followers: artist.followers.total,
    popularity: artist.popularity,
    genres: artist.genres ?? [],
  };
}

// ============================================================================
// Provider Status
// ============================================================================

/**
 * Check if Spotify provider is available.
 *
 * @returns True if configured and circuit breaker is not open
 */
export function isSpotifyAvailable(): boolean {
  return isSpotifyConfigured() && spotifyCircuitBreaker.getState() !== 'OPEN';
}

/**
 * Get Spotify circuit breaker stats.
 */
export function getSpotifyStats() {
  return {
    configured: isSpotifyConfigured(),
    circuitBreaker: spotifyCircuitBreaker.getStats(),
  };
}
