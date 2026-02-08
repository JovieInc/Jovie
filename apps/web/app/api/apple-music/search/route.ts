import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import {
  extractImageUrls,
  isAppleMusicAvailable,
  searchArtist,
} from '@/lib/dsp-enrichment/providers/apple-music';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';
import { artistSearchQuerySchema } from '@/lib/validation/schemas/spotify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 60;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

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

// In-memory rate limiting per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const MAX_RATE_LIMIT_ENTRIES = 500;

function cleanupRateLimitMap(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
  if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
    const entries = Array.from(rateLimitMap.entries());
    entries.sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toDelete = entries.slice(0, entries.length - MAX_RATE_LIMIT_ENTRIES);
    toDelete.forEach(([ip]) => rateLimitMap.delete(ip));
  }
}

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

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function checkRateLimit(ip: string): {
  limited: boolean;
  remaining: number;
  resetAt: number;
} {
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

/**
 * GET /api/apple-music/search?q={query}&limit={limit}
 * Returns a JSON list of Apple Music artists matching the query.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q')?.trim();
  const limitParam = searchParams.get('limit');

  if (!isAppleMusicAvailable()) {
    return NextResponse.json(
      { error: 'Apple Music integration not available', code: 'UNAVAILABLE' },
      { status: 503, headers: NO_STORE_HEADERS }
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

  const cacheKey = `${q.toLowerCase()}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return NextResponse.json(cached.data, { headers: rateLimitHeaders });
  }

  try {
    const artists = await searchArtist(q, {}, limit);

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
    cleanupSearchCache();
    cleanupRateLimitMap();
  }
}
