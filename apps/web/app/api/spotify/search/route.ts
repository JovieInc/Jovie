import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cacheQuery } from '@/lib/db/cache';
import { NO_STORE_HEADERS, RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import { buildSpotifyArtistUrl } from '@/lib/spotify';
import { getAlphabetResults } from '@/lib/spotify/alphabet-cache';
import { CircuitOpenError } from '@/lib/spotify/circuit-breaker';
import { isSpotifyAvailable, spotifyClient } from '@/lib/spotify/client';
import { logger } from '@/lib/utils/logger';
import { artistSearchQuerySchema } from '@/lib/validation/schemas/spotify';
import { applyVipBoost, parseLimit } from './helpers';

// API routes should be dynamic
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Query constraints
const MIN_QUERY_LENGTH = 1;
const MAX_QUERY_LENGTH = 60;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const SEARCH_CACHE_TTL_SECONDS = 300; // 5 minutes

// Normalized response shape for client
export interface SpotifyArtistResult {
  id: string;
  name: string;
  url: string;
  imageUrl?: string;
  followers?: number;
  popularity: number;
  verified?: boolean;
}

/**
 * In-memory rate limiting per IP with proactive cleanup
 *
 * LIMITATION: This rate limiting resets on each deployment and is per-instance
 * in a serverless environment. This means:
 * - Rate limits reset when the app redeploys
 * - Different serverless instances have independent rate limit state
 *
 * For production-grade rate limiting, consider:
 * - Vercel Edge Config or KV for persistent state
 * - Upstash Redis for distributed rate limiting
 * - Cloudflare Rate Limiting at the edge
 *
 * Current implementation provides basic protection against abuse while
 * keeping infrastructure simple. Monitor usage and upgrade if needed.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute per IP
const MAX_RATE_LIMIT_ENTRIES = 500; // Maximum IPs to track to prevent memory exhaustion

/**
 * Proactively clean expired rate limit entries to prevent memory exhaustion.
 * Uses LRU-style eviction when limit is reached.
 */
function cleanupRateLimitMap(): void {
  const now = Date.now();

  // First, remove all expired entries
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }

  // If still over limit, remove oldest entries (LRU eviction)
  if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
    const entries = Array.from(rateLimitMap.entries());
    entries.sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toDelete = entries.slice(0, entries.length - MAX_RATE_LIMIT_ENTRIES);
    toDelete.forEach(([ip]) => rateLimitMap.delete(ip));
  }
}

function getClientIp(request: NextRequest): string {
  // Priority: CF > Real IP > Forwarded
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetAt: number;
}

function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return {
      limited: false,
      remaining: RATE_LIMIT_MAX - 1,
      resetAt: now + RATE_LIMIT_WINDOW,
    };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { limited: true, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    limited: false,
    remaining: RATE_LIMIT_MAX - entry.count,
    resetAt: entry.resetAt,
  };
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

  // Rate limiting with headers for client visibility
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(clientIp);

  const rateLimitHeaders = {
    ...NO_STORE_HEADERS,
    'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
    'X-RateLimit-Remaining': String(rateLimit.remaining),
    'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetAt / 1000)),
  } as const;

  if (rateLimit.limited) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'RATE_LIMITED' },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders,
          'Retry-After': String(
            Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  // Fast path: single-letter queries served from alphabet pre-cache
  if (q.length === 1 && /^[a-zA-Z]$/.test(q)) {
    const alphabetResults = await getAlphabetResults(q.toLowerCase());
    if (alphabetResults && alphabetResults.length > 0) {
      return NextResponse.json(alphabetResults, { headers: rateLimitHeaders });
    }
    // No cached results — return empty rather than hitting Spotify with a 1-char query
    return NextResponse.json([], { headers: rateLimitHeaders });
  }

  try {
    // Multi-layer cache (in-memory LRU + Redis) wrapping Spotify API
    const cacheKey = `spotify:search:${q.toLowerCase()}:${limit}`;
    const results = await cacheQuery<SpotifyArtistResult[]>(
      cacheKey,
      async () => {
        // Use the hardened Spotify client with circuit breaker and retry
        const artists = await spotifyClient.searchArtists(q, limit);

        // Normalize response shape (data already sanitized by client)
        const normalizedResults: SpotifyArtistResult[] = artists.map(
          artist => ({
            id: artist.spotifyId,
            name: artist.name,
            url: buildSpotifyArtistUrl(artist.spotifyId),
            imageUrl: artist.imageUrl ?? undefined,
            followers: artist.followerCount,
            popularity: artist.popularity,
            // Spotify doesn't expose verified status via search API
            verified: undefined,
          })
        );

        // VIP boost: Prioritize featured creators for exact name matches
        return applyVipBoost(normalizedResults, q, limit);
      },
      { ttlSeconds: SEARCH_CACHE_TTL_SECONDS, useRedis: true }
    );

    return NextResponse.json(results, { headers: rateLimitHeaders });
  } catch (error) {
    // Handle circuit breaker open error
    if (error instanceof CircuitOpenError) {
      Sentry.captureException(error, {
        tags: { source: 'spotify_search_api' },
        extra: { query: q, limit, circuitStats: error.stats },
      });
      return NextResponse.json(
        {
          error: 'Service temporarily unavailable',
          code: 'SERVICE_UNAVAILABLE',
        },
        { status: 503, headers: rateLimitHeaders }
      );
    }

    // Log and capture other errors
    Sentry.captureException(error, {
      tags: { source: 'spotify_search_api' },
      extra: { query: q, limit },
    });

    logger.error('[Spotify Search] Search failed:', {
      query: q,
      limit,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Search failed', code: 'SEARCH_FAILED' },
      { status: 500, headers: rateLimitHeaders }
    );
  } finally {
    // Probabilistic cleanup (10% of requests) to amortize cost.
    if (Math.random() < 0.1 || rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
      cleanupRateLimitMap();
    }
  }
}
