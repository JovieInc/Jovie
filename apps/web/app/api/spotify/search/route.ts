import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import type { SpotifyArtistResult } from '@/lib/contracts/api';
import { captureError } from '@/lib/error-tracking';

export type { SpotifyArtistResult } from '@/lib/contracts/api';

import { cacheQuery } from '@/lib/db/cache';
import { NO_STORE_HEADERS, RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import {
  createRateLimitHeaders,
  getClientIP,
  spotifySearchApiLimiter,
} from '@/lib/rate-limit';
import {
  buildSpotifyArtistUrl,
  isSpotifyAvailable,
  spotifyClient,
} from '@/lib/spotify';
import { getAlphabetResults } from '@/lib/spotify/alphabet-cache';
import { filterBlacklistedResults } from '@/lib/spotify/blacklist';
import { CircuitOpenError } from '@/lib/spotify/circuit-breaker';
import { logger } from '@/lib/utils/logger';
import { artistSearchQuerySchema } from '@/lib/validation/schemas/spotify';
import {
  annotateClaimedStatus,
  annotateClaimedStatusWithMeta,
  applyVipBoost,
  applyVipBoostWithMeta,
  boostClaimedArtists,
  parseLimit,
} from './helpers';

// API routes should be dynamic
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Query constraints
const MIN_QUERY_LENGTH = 1;
const MAX_QUERY_LENGTH = 60;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const SEARCH_CACHE_TTL_SECONDS = 300; // 5 minutes
// NOTE: claimed-artist status is cached here for 60s on top of the 30s
// unstable_cache inside getCachedClaimedSpotifyIds, so effective max staleness
// for claimed badges is about 90 seconds.
const SEARCH_RESPONSE_CACHE_TTL_SECONDS = 60; // 1 minute

class SearchEnrichmentFallbackError extends Error {
  constructor(readonly results: SpotifyArtistResult[]) {
    super('Spotify search enrichment fell back to a degraded payload');
    this.name = 'SearchEnrichmentFallbackError';
  }
}

function handleSearchError(
  error: unknown,
  q: string,
  limit: number,
  headers: HeadersInit
): NextResponse {
  if (error instanceof CircuitOpenError) {
    captureError('[Spotify Search] Circuit open', error, {
      source: 'spotify_search_api',
      query: q,
      limit,
    });
    return NextResponse.json(
      {
        error: 'Service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE',
      },
      { status: 503, headers }
    );
  }

  captureError('[Spotify Search] Search failed', error, {
    source: 'spotify_search_api',
    query: q,
    limit,
  });

  logger.error('[Spotify Search] Search failed:', {
    query: q,
    limit,
    error: error instanceof Error ? error.message : String(error),
  });

  return NextResponse.json(
    { error: 'Search failed', code: 'SEARCH_FAILED' },
    { status: 500, headers }
  );
}

function validateSearchQuery(q: string | undefined): NextResponse | null {
  if (!isSpotifyAvailable()) {
    return NextResponse.json(
      { error: 'Spotify integration not available', code: 'UNAVAILABLE' },
      {
        status: 503,
        headers: { ...NO_STORE_HEADERS, 'Retry-After': RETRY_AFTER_SERVICE },
      }
    );
  }

  const queryValidation = artistSearchQuerySchema.safeParse(q);
  if (!queryValidation.success) {
    const errorMessage =
      queryValidation.error.issues[0]?.message || 'Invalid query';
    return NextResponse.json(
      { error: errorMessage, code: 'INVALID_QUERY' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!q || q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      { error: 'Query too short', code: 'QUERY_TOO_SHORT' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: 'Query too long', code: 'QUERY_TOO_LONG' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  return null;
}

/**
 * GET /api/spotify/search?q={query}&limit={limit}
 * Returns a JSON list of Spotify artists matching the query.
 *
 * Uses hardened Spotify client with:
 * - Circuit breaker for fault tolerance
 * - Retry logic with exponential backoff
 * - Input validation with Zod
 * - Data sanitization
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q')?.trim();
  const limitParam = searchParams.get('limit');

  const validationError = validateSearchQuery(q);
  if (validationError || !q) {
    return (
      validationError ??
      NextResponse.json(
        { error: 'Query required', code: 'INVALID_QUERY' },
        { status: 400, headers: NO_STORE_HEADERS }
      )
    );
  }

  // Parse and clamp limit
  const limit = parseLimit(limitParam, DEFAULT_LIMIT, MAX_LIMIT);
  const normalizedQuery = q.toLowerCase();

  // Rate limiting with headers for client visibility
  const identifier = userId ? `user:${userId}` : `ip:${getClientIP(request)}`;
  const rateLimitResult = await spotifySearchApiLimiter.limit(identifier);
  const rateLimitHeaders = {
    ...NO_STORE_HEADERS,
    ...createRateLimitHeaders(rateLimitResult),
  } as const;

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'RATE_LIMITED' },
      {
        status: 429,
        headers: rateLimitHeaders,
      }
    );
  }

  // Fast path: single-letter queries served from alphabet pre-cache
  if (q.length === 1 && /^[a-zA-Z]$/.test(q)) {
    const alphabetResults = await getAlphabetResults(q.toLowerCase());
    if (alphabetResults && alphabetResults.length > 0) {
      const filtered = filterBlacklistedResults(alphabetResults);
      const annotated = await annotateClaimedStatus(filtered);
      const claimedBoosted = boostClaimedArtists(annotated);
      const vipBoosted = await applyVipBoost(claimedBoosted, q, limit);
      return NextResponse.json(vipBoosted, { headers: rateLimitHeaders });
    }
    // No cached results — return empty rather than hitting Spotify with a 1-char query
    return NextResponse.json([], { headers: rateLimitHeaders });
  }

  try {
    const responseCacheKey = `spotify:search:response:${normalizedQuery}:${limit}`;
    const rawCacheKey = `spotify:search:${normalizedQuery}:${limit}`;
    const loadRawResults = () =>
      cacheQuery<SpotifyArtistResult[]>(
        rawCacheKey,
        async () => {
          // Use the hardened Spotify client with circuit breaker and retry
          const artists = await spotifyClient.searchArtists(q, limit);

          // Normalize response shape (data already sanitized by client)
          return artists.map(artist => ({
            id: artist.spotifyId,
            name: artist.name,
            url: buildSpotifyArtistUrl(artist.spotifyId),
            imageUrl: artist.imageUrl ?? undefined,
            followers: artist.followerCount,
            popularity: artist.popularity,
            // Spotify doesn't expose verified status via search API
            verified: undefined,
          }));
        },
        { ttlSeconds: SEARCH_CACHE_TTL_SECONDS, useRedis: true }
      );
    const buildEnrichedResults = async (
      cachedResults: SpotifyArtistResult[]
    ) => {
      const safeResults = filterBlacklistedResults(cachedResults);
      const annotated = await annotateClaimedStatusWithMeta(safeResults);
      const claimedBoosted = boostClaimedArtists(annotated.results);
      const vipBoosted = await applyVipBoostWithMeta(claimedBoosted, q, limit);

      const results = vipBoosted.results;
      if (annotated.degraded || vipBoosted.degraded) {
        throw new SearchEnrichmentFallbackError(results);
      }
      return results;
    };

    let results: SpotifyArtistResult[];
    try {
      results = await cacheQuery<SpotifyArtistResult[]>(
        responseCacheKey,
        async () => buildEnrichedResults(await loadRawResults()),
        { ttlSeconds: SEARCH_RESPONSE_CACHE_TTL_SECONDS, useRedis: true }
      );
    } catch (error) {
      if (error instanceof SearchEnrichmentFallbackError) {
        results = error.results;
      } else {
        throw error;
      }
    }

    return NextResponse.json(results, { headers: rateLimitHeaders });
  } catch (error) {
    return handleSearchError(error, q, limit, rateLimitHeaders);
  }
}
