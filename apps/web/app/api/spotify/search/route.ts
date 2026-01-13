import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { getFeaturedCreatorsForSearch } from '@/lib/featured-creators';
import { buildSpotifyArtistUrl } from '@/lib/spotify';
import { CircuitOpenError } from '@/lib/spotify/circuit-breaker';
import { isSpotifyAvailable, spotifyClient } from '@/lib/spotify/client';
import { artistSearchQuerySchema } from '@/lib/validation/schemas/spotify';

// API routes should be dynamic
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Query constraints
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 60;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

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

// Simple in-memory cache for API responses
const searchCache = new Map<
  string,
  { data: SpotifyArtistResult[]; timestamp: number }
>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * In-memory rate limiting per IP
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

  // Check if Spotify is available
  if (!isSpotifyAvailable()) {
    return NextResponse.json(
      { error: 'Spotify integration not available', code: 'UNAVAILABLE' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  // Validate query using Zod schema
  const queryValidation = artistSearchQuerySchema.safeParse(q);
  if (!queryValidation.success) {
    const errorMessage =
      queryValidation.error.issues[0]?.message || 'Invalid query';
    return NextResponse.json(
      { error: errorMessage, code: 'INVALID_QUERY' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // Additional length checks for API-specific constraints
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

  // Parse and clamp limit
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

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

  // Check cache first
  const cacheKey = `${q.toLowerCase()}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return NextResponse.json(cached.data, { headers: rateLimitHeaders });
  }

  try {
    // Use the hardened Spotify client with circuit breaker and retry
    const artists = await spotifyClient.searchArtists(q, limit);

    // Normalize response shape (data already sanitized by client)
    let results: SpotifyArtistResult[] = artists.map(artist => ({
      id: artist.spotifyId,
      name: artist.name,
      url: buildSpotifyArtistUrl(artist.spotifyId),
      imageUrl: artist.imageUrl ?? undefined,
      followers: artist.followerCount,
      popularity: artist.popularity,
      // Spotify doesn't expose verified status via search API
      verified: undefined,
    }));

    // VIP boost: Prioritize featured creators for exact name matches
    try {
      const vipMap = await getFeaturedCreatorsForSearch();
      const normalizedQuery = q.toLowerCase().trim();
      const vipArtist = vipMap.get(normalizedQuery);

      if (vipArtist) {
        // Check if VIP artist is already in results
        const existingIndex = results.findIndex(
          r => r.id === vipArtist.spotifyId
        );

        if (existingIndex > 0) {
          // Move to top if already in results but not first
          const [vipResult] = results.splice(existingIndex, 1);
          results = [vipResult, ...results];
        } else if (existingIndex === -1) {
          // Add to top if not in results at all
          const vipResult: SpotifyArtistResult = {
            id: vipArtist.spotifyId,
            name: vipArtist.name,
            url: buildSpotifyArtistUrl(vipArtist.spotifyId),
            imageUrl: vipArtist.imageUrl ?? undefined,
            followers: vipArtist.followers,
            popularity: vipArtist.popularity,
            verified: undefined,
          };
          results = [vipResult, ...results.slice(0, limit - 1)];
        }
        // If existingIndex === 0, already at top, no action needed
      }
    } catch (vipError) {
      // VIP lookup failure should not break search - log and continue
      console.warn('[Spotify Search] VIP lookup failed:', vipError);
    }

    // Cache the results
    searchCache.set(cacheKey, {
      data: results,
      timestamp: Date.now(),
    });

    // Clean up old cache entries (keep only last 100 entries)
    if (searchCache.size > 100) {
      const entries = Array.from(searchCache.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      const toDelete = entries.slice(100);
      toDelete.forEach(([key]) => searchCache.delete(key));
    }

    // Clean up expired rate limit entries
    if (rateLimitMap.size > 1000) {
      const now = Date.now();
      for (const [ip, entry] of rateLimitMap.entries()) {
        if (now > entry.resetAt) {
          rateLimitMap.delete(ip);
        }
      }
    }

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

    console.error('[Spotify Search] Search failed:', {
      query: q,
      limit,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Search failed', code: 'SEARCH_FAILED' },
      { status: 500, headers: rateLimitHeaders }
    );
  }
}
