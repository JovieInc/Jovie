/**
 * Musicfetch API Client
 *
 * Resolves cross-platform streaming links using ISRC lookups.
 * Used as a supplementary source alongside custom Apple Music/Deezer lookups
 * to provide canonical links for additional DSPs.
 *
 * @see https://musicfetch.io/docs
 */

import 'server-only';

import * as Sentry from '@sentry/nextjs';

import { env } from '@/lib/env-server';
import {
  MusicfetchRequestError,
  musicfetchRequest,
} from '@/lib/musicfetch/resilient-client';

import { musicfetchCircuitBreaker } from './musicfetch-circuit-breaker';

// ============================================================================
// Configuration
// ============================================================================

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Maps musicfetch camelCase service names to Jovie snake_case ProviderKeys.
 * Only includes services we actively support.
 */
const SERVICE_TO_PROVIDER: Record<string, string> = {
  spotify: 'spotify',
  appleMusic: 'apple_music',
  youtubeMusic: 'youtube',
  youtube: 'youtube',
  soundcloud: 'soundcloud',
  deezer: 'deezer',
  tidal: 'tidal',
  amazonMusic: 'amazon_music',
  bandcamp: 'bandcamp',
  beatport: 'beatport',
  pandora: 'pandora',
  napster: 'napster',
  audiomack: 'audiomack',
  qobuz: 'qobuz',
  anghami: 'anghami',
  boomplay: 'boomplay',
  iHeartRadio: 'iheartradio',
  tiktok: 'tiktok',
};

/** The musicfetch service IDs to request (camelCase, as the API expects) */
const TARGET_SERVICES = [
  'spotify',
  'appleMusic',
  'youtubeMusic',
  'soundcloud',
  'deezer',
  'tidal',
  'amazonMusic',
  'bandcamp',
  'beatport',
  'pandora',
  'napster',
  'audiomack',
  'qobuz',
  'anghami',
  'boomplay',
  'iHeartRadio',
  'tiktok',
];

// ============================================================================
// Types
// ============================================================================

export interface MusicfetchServiceResult {
  url: string;
  [key: string]: unknown;
}

export interface MusicfetchIsrcResult {
  type: string;
  name: string;
  isrc: string;
  services: Record<string, MusicfetchServiceResult>;
  artists?: Array<{ name: string }>;
  albums?: Array<{ name: string }>;
}

interface MusicfetchResponse {
  result: MusicfetchIsrcResult;
}

export interface MusicfetchLookupResult {
  /** Maps ProviderKey -> canonical URL */
  links: Record<string, string>;
  /** Raw result for debugging/metadata */
  raw: MusicfetchIsrcResult;
}

// ============================================================================
// Error Class
// ============================================================================

export class MusicfetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'MusicfetchError';
  }

  /**
   * Whether this error is due to rate limiting (429).
   */
  isRateLimited(): boolean {
    return this.statusCode === 429;
  }
}

// ============================================================================
// Availability Checks
// ============================================================================

export function isMusicfetchConfigured(): boolean {
  return !!env.MUSICFETCH_API_TOKEN;
}

export function isMusicfetchAvailable(): boolean {
  return (
    isMusicfetchConfigured() && musicfetchCircuitBreaker.getState() !== 'OPEN'
  );
}

// ============================================================================
// Core API Client
// ============================================================================

/**
 * Look up streaming links for a track by ISRC across all supported DSPs.
 *
 * Returns a map of ProviderKey -> canonical URL, or null if the lookup fails
 * or musicfetch is not configured.
 */
export async function lookupByIsrc(
  isrc: string,
  options?: { services?: string[] }
): Promise<MusicfetchLookupResult | null> {
  const token = env.MUSICFETCH_API_TOKEN;
  if (!token) return null;

  const services = options?.services ?? TARGET_SERVICES;
  const servicesParam = services.join(',');

  try {
    const result = await musicfetchCircuitBreaker.execute(async () => {
      const params = new URLSearchParams({
        isrc,
        services: servicesParam,
      });

      try {
        return await musicfetchRequest<MusicfetchResponse>('/isrc', params, {
          timeoutMs: REQUEST_TIMEOUT_MS,
        });
      } catch (error) {
        if (error instanceof MusicfetchRequestError) {
          throw new MusicfetchError(
            error.message,
            error.statusCode,
            error.retryAfterSeconds
          );
        }
        throw error;
      }
    });

    if (!result?.result?.services) return null;

    // Map musicfetch service names to our ProviderKey -> URL
    const links: Record<string, string> = {};
    for (const [serviceName, serviceData] of Object.entries(
      result.result.services
    )) {
      const providerKey = SERVICE_TO_PROVIDER[serviceName];
      if (providerKey && serviceData?.url) {
        links[providerKey] = serviceData.url;
      }
    }

    Sentry.addBreadcrumb({
      category: 'musicfetch',
      message: `ISRC lookup resolved ${Object.keys(links).length} providers`,
      level: 'debug',
      data: { isrc, providersFound: Object.keys(links) },
    });

    return { links, raw: result.result };
  } catch (error) {
    Sentry.addBreadcrumb({
      category: 'musicfetch',
      message: 'ISRC lookup failed',
      level: 'warning',
      data: {
        isrc,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    return null;
  }
}

// ============================================================================
// Stats
// ============================================================================

export function getMusicfetchStats() {
  return {
    configured: isMusicfetchConfigured(),
    circuitBreaker: musicfetchCircuitBreaker.getStats(),
  };
}
