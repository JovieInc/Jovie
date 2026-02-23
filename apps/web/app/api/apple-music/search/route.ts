import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { CircuitOpenError } from '@/lib/dsp-enrichment/circuit-breakers';
import {
  AppleMusicError,
  AppleMusicNotConfiguredError,
  extractImageUrls,
  isAppleMusicAvailable,
  searchArtist,
} from '@/lib/dsp-enrichment/providers/apple-music';
import { NO_STORE_HEADERS, RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import {
  appleMusicSearchLimiter,
  createRateLimitHeaders,
  getClientIP,
} from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import { artistSearchQuerySchema } from '@/lib/validation/schemas/spotify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 60;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const SEARCH_MAX_RETRIES = 1;
const SEARCH_BASE_DELAY_MS = 1000;

interface AppleMusicArtistResult {
  id: string;
  name: string;
  url: string;
  imageUrl?: string;
  genres?: string[];
}

// Simple in-memory cache
const searchCache = new Map<
  string,
  { data: AppleMusicArtistResult[]; timestamp: number }
>();
const CACHE_DURATION = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 100;

function cleanupSearchCache(): void {
  const now = Date.now();
  for (const [key, entry] of searchCache.entries()) {
    if (now - entry.timestamp > CACHE_DURATION) {
      searchCache.delete(key);
    }
  }
  if (searchCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(searchCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    toDelete.forEach(([key]) => searchCache.delete(key));
  }
}

function parseLimit(
  limitParam: string | null,
  defaultLimit: number,
  maxLimit: number
): number {
  if (!limitParam) return defaultLimit;
  const parsed = Number.parseInt(limitParam, 10);
  if (Number.isNaN(parsed) || parsed < 1) return defaultLimit;
  return Math.min(parsed, maxLimit);
}

function isRetryableSearchError(error: unknown): boolean {
  if (error instanceof CircuitOpenError) return false;
  if (error instanceof AppleMusicNotConfiguredError) return false;
  if (error instanceof AppleMusicError) {
    return error.statusCode !== 401 && error.statusCode !== 404;
  }
  return true;
}

function calculateRetryDelay(attempt: number): number {
  const jitter = Math.random() * 0.3 + 0.85;
  return SEARCH_BASE_DELAY_MS * Math.pow(2, attempt) * jitter;
}

async function searchArtistWithRetry(query: string, limit: number) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= SEARCH_MAX_RETRIES; attempt++) {
    try {
      return await searchArtist(query, {}, limit);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!isRetryableSearchError(error) || attempt >= SEARCH_MAX_RETRIES) {
        throw lastError;
      }
      const delayMs = calculateRetryDelay(attempt);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError ?? new Error('Apple Music search retry failed');
}

/**
 * GET /api/apple-music/search?q={query}&limit={limit}
 * Returns a JSON list of Apple Music artists matching the query.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q')?.trim();
  const limitParam = searchParams.get('limit');

  if (!isAppleMusicAvailable()) {
    return NextResponse.json(
      { error: 'Apple Music integration not available', code: 'UNAVAILABLE' },
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

  const limit = parseLimit(limitParam, DEFAULT_LIMIT, MAX_LIMIT);

  const clientIp = getClientIP(request);
  const rateLimitResult = await appleMusicSearchLimiter.limit(clientIp);
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

  const cacheKey = `${q.toLowerCase()}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return NextResponse.json(cached.data, { headers: rateLimitHeaders });
  }

  try {
    const artists = await searchArtistWithRetry(q, limit);

    const results: AppleMusicArtistResult[] = artists.map(artist => {
      const images = extractImageUrls(artist.attributes?.artwork);
      return {
        id: artist.id,
        name: artist.attributes?.name ?? 'Unknown Artist',
        url:
          artist.attributes?.url ??
          `https://music.apple.com/artist/${artist.id}`,
        imageUrl: images?.medium ?? images?.small ?? undefined,
        genres: artist.attributes?.genreNames ?? undefined,
      };
    });

    searchCache.set(cacheKey, {
      data: results,
      timestamp: Date.now(),
    });

    return NextResponse.json(results, { headers: rateLimitHeaders });
  } catch (error) {
    // Handle circuit breaker open error with proper 503
    if (error instanceof CircuitOpenError) {
      Sentry.captureException(error, {
        tags: { source: 'apple_music_search_api' },
        extra: { query: q, limit, circuitStats: error.stats },
      });
      return NextResponse.json(
        {
          error: 'Service temporarily unavailable',
          code: 'SERVICE_UNAVAILABLE',
        },
        {
          status: 503,
          headers: {
            ...rateLimitHeaders,
            'Retry-After': RETRY_AFTER_SERVICE,
          },
        }
      );
    }

    Sentry.captureException(error, {
      tags: { source: 'apple_music_search_api' },
      extra: { query: q, limit },
    });

    logger.error('[Apple Music Search] Search failed:', {
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
    // Full cleanup on every request is O(n log n) due to sorting;
    // force cleanup when maps exceed size limits.
    if (Math.random() < 0.1 || searchCache.size > MAX_CACHE_SIZE) {
      cleanupSearchCache();
    }
  }
}
