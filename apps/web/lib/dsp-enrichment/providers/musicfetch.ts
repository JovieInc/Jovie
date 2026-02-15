/**
 * MusicFetch.io Provider
 *
 * Cross-platform artist lookup via MusicFetch.io API.
 * Given a Spotify artist URL, returns DSP profile links and social profiles
 * across 30+ platforms in a single request.
 *
 * @see https://musicfetch.io/docs/url
 */

import 'server-only';

import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// Configuration
// ============================================================================

const MUSICFETCH_API_BASE = 'https://api.musicfetch.io';

/** Request timeout — external API may be slow */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Services to request from MusicFetch when looking up an artist.
 * Covers major DSPs + social platforms.
 */
const ARTIST_LOOKUP_SERVICES = [
  'appleMusic',
  'youtube',
  'youtubeMusic',
  'soundcloud',
  'deezer',
  'tidal',
  'amazonMusic',
  'bandcamp',
  'instagram',
  'tiktok',
].join(',');

// ============================================================================
// Types
// ============================================================================

export interface MusicFetchService {
  url?: string;
  id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface MusicFetchArtistResult {
  type: 'artist';
  name: string;
  image?: { url?: string };
  bio?: string;
  services: Record<string, MusicFetchService>;
}

interface MusicFetchResponse {
  result: MusicFetchArtistResult;
}

// ============================================================================
// Availability
// ============================================================================

/**
 * Check if MusicFetch.io is configured.
 */
export function isMusicFetchAvailable(): boolean {
  return Boolean(env.MUSICFETCH_API_TOKEN);
}

// ============================================================================
// API Client
// ============================================================================

/**
 * Look up an artist by their Spotify URL via MusicFetch.io.
 *
 * Returns cross-platform DSP links and social profiles, or null on failure.
 */
export async function fetchArtistBySpotifyUrl(
  spotifyUrl: string
): Promise<MusicFetchArtistResult | null> {
  if (!isMusicFetchAvailable()) {
    logger.warn('MusicFetch API token not configured, skipping enrichment');
    return null;
  }

  const params = new URLSearchParams({
    url: spotifyUrl,
    services: ARTIST_LOOKUP_SERVICES,
  });

  const url = `${MUSICFETCH_API_BASE}/url?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-token': env.MUSICFETCH_API_TOKEN!,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 429) {
      logger.warn('MusicFetch rate limit hit', {
        retryAfter: response.headers.get('retry-after'),
      });
      return null;
    }

    if (!response.ok) {
      logger.warn('MusicFetch API error', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data: MusicFetchResponse = await response.json();

    if (!data.result || data.result.type !== 'artist') {
      logger.warn('MusicFetch returned non-artist result', {
        type: data.result?.type,
        spotifyUrl,
      });
      return null;
    }

    return data.result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      logger.warn('MusicFetch request timed out', { spotifyUrl });
    } else {
      logger.warn('MusicFetch request failed', {
        spotifyUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return null;
  }
}

// ============================================================================
// URL Parsing Helpers
// ============================================================================

/**
 * Extract Apple Music artist ID from a URL.
 * Format: https://music.apple.com/{storefront}/artist/{name}/{id}
 */
export function extractAppleMusicId(url: string): string | null {
  const match = /music\.apple\.com\/[a-z]{2}\/artist\/[^/]+\/(\d+)/.exec(url);
  return match?.[1] ?? null;
}

/**
 * Extract Deezer artist ID from a URL.
 * Format: https://www.deezer.com/artist/{id}
 */
export function extractDeezerId(url: string): string | null {
  const match = /deezer\.com\/(?:[a-z]{2}\/)?artist\/(\d+)/.exec(url);
  return match?.[1] ?? null;
}

/**
 * Extract Tidal artist ID from a URL.
 * Format: https://tidal.com/browse/artist/{id} or https://listen.tidal.com/artist/{id}
 */
export function extractTidalId(url: string): string | null {
  const match = /(?:listen\.)?tidal\.com\/(?:browse\/)?artist\/(\d+)/.exec(url);
  return match?.[1] ?? null;
}

/**
 * Extract SoundCloud slug from a URL.
 * Format: https://soundcloud.com/{slug}
 */
export function extractSoundcloudId(url: string): string | null {
  const match = /soundcloud\.com\/([a-zA-Z0-9_-]+)\/?$/.exec(url);
  return match?.[1] ?? null;
}

/**
 * Extract YouTube Music channel ID from a URL.
 * Format: https://music.youtube.com/channel/{id}
 */
export function extractYoutubeMusicId(url: string): string | null {
  const match = /music\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/.exec(url);
  return match?.[1] ?? null;
}
