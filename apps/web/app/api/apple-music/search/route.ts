import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import type { AppleMusicArtistResult } from '@/lib/contracts/api';
import { cacheQuery } from '@/lib/db/cache';
import { CircuitOpenError } from '@/lib/dsp-enrichment/circuit-breakers';
import {
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
const APPLE_MUSIC_SEARCH_CACHE_TTL_SECONDS = 60 * 60; // 1 hour

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
  const { userId } = await auth();
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

  const hasUser = !!userId;
  const identifier = hasUser ? `user:${userId}` : `ip:${getClientIP(request)}`;
  const rateLimitResult = await appleMusicSearchLimiter.limit(identifier);
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

  const cacheKey = `apple-music:search:${q.toLowerCase()}:${limit}`;

  try {
    const results = await cacheQuery<AppleMusicArtistResult[]>(
      cacheKey,
      async () => {
        const artists = await searchArtist(q, {}, limit);
        return artists.map(artist => {
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
      },
      { ttlSeconds: APPLE_MUSIC_SEARCH_CACHE_TTL_SECONDS }
    );

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
  }
}
