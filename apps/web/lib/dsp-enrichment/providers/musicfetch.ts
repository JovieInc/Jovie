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

import * as Sentry from '@sentry/nextjs';
import { env } from '@/lib/env-server';
import {
  isMusicfetchInvalidServicesError,
  MusicfetchBudgetExceededError,
  MusicfetchRequestError,
  musicfetchRequest,
} from '@/lib/musicfetch/resilient-client';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// Configuration
// ============================================================================

/** Request timeout — external API may be slow */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Services to request from MusicFetch when looking up an artist.
 *
 * This is intentionally narrower than the full DSP registry. The MusicFetch
 * artist lookup endpoint rejects some registry values (`allMusic`,
 * `youtubeShorts`, `napster`, `telmoreMusik`) and our current account also
 * does not have every optional social provider enabled. Invalid values cause a
 * hard 400 and abort enrichment entirely, so keep this list limited to the
 * stable supported subset for artist lookups.
 */
export const MUSICFETCH_ARTIST_LOOKUP_SERVICES = [
  'spotify',
  'appleMusic',
  'youtubeMusic',
  'soundcloud',
  'deezer',
  'tidal',
  'amazonMusic',
  'bandcamp',
  'pandora',
  'audiomack',
  'qobuz',
  'anghami',
  'boomplay',
  'iHeartRadio',
  'beatport',
  'youtube',
  'genius',
  'discogs',
  'musicBrainz',
  'shazam',
  'sevenDigital',
  'youseeMusik',
] as const;

const ARTIST_LOOKUP_SERVICES = MUSICFETCH_ARTIST_LOOKUP_SERVICES.join(',');

// ============================================================================
// Types
// ============================================================================

export interface MusicFetchService {
  /** URL for this service — MusicFetch API returns this as `link` */
  url?: string;
  /** MusicFetch API returns the URL in the `link` field */
  link?: string;
  id?: string;
  name?: string;
  [key: string]: unknown;
}

/** Get the URL from a MusicFetch service entry (API returns `link`, not `url`) */
export function getMusicFetchServiceUrl(
  service: MusicFetchService | undefined
): string | undefined {
  return service?.link ?? service?.url;
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
 * Returns cross-platform DSP links and social profiles, or null for
 * non-retryable lookup failures.
 *
 * @throws {MusicfetchRequestError} When MusicFetch rejects the configured
 * service list with an invalid-services 400 detected by
 * isMusicfetchInvalidServicesError().
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

  return Sentry.startSpan(
    {
      op: 'music.fetch',
      name: 'MusicFetch: fetch artist by Spotify URL',
      attributes: { 'music.fetch.url': spotifyUrl },
    },
    async span => {
      Sentry.addBreadcrumb({
        category: 'music.fetch',
        message: `Fetching MusicFetch data for Spotify URL`,
        data: { spotifyUrl, timestamp: new Date().toISOString() },
        level: 'info',
      });

      try {
        const data = await musicfetchRequest<MusicFetchResponse>(
          '/url',
          params,
          {
            timeoutMs: REQUEST_TIMEOUT_MS,
          }
        );

        if (!data.result || data.result?.type !== 'artist') {
          logger.warn('MusicFetch returned non-artist result', {
            type: data.result?.type,
            spotifyUrl,
          });
          span.setStatus({ code: 2, message: 'non-artist result' });
          return null;
        }

        span.setStatus({ code: 1, message: 'ok' });
        return data.result;
      } catch (error) {
        span.setStatus({ code: 2, message: 'error' });

        if (error instanceof MusicfetchRequestError) {
          logger.warn('MusicFetch request failed', {
            spotifyUrl,
            statusCode: error.statusCode,
            retryAfterSeconds: error.retryAfterSeconds,
            details: error.details,
            budgetScope:
              error instanceof MusicfetchBudgetExceededError
                ? error.budgetScope
                : undefined,
            message: error.message,
          });

          if (error.statusCode === 400) {
            if (isMusicfetchInvalidServicesError(error)) {
              throw error;
            }
            return null;
          }

          throw error;
        }

        logger.warn('MusicFetch request failed', {
          spotifyUrl,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error instanceof Error
          ? error
          : new Error('MusicFetch request failed');
      }
    }
  );
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
