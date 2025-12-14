import { NextRequest, NextResponse } from 'next/server';
import { buildSpotifyArtistUrl, searchSpotifyArtists } from '@/lib/spotify';

// API routes should be dynamic
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

interface SpotifyArtistApi {
  id: string;
  name: string;
  images?: Array<{ url: string; height: number; width: number }>;
  popularity: number;
  followers?: { total: number };
}

// Simple in-memory cache for API responses
const searchCache = new Map<
  string,
  { data: SpotifyArtistResult[]; timestamp: number }
>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Simple rate limiting per IP (in-memory, resets on deploy)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute per IP

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }

  entry.count++;
  return false;
}

/**
 * GET /api/spotify/search?q={query}&limit={limit}
 * Returns a JSON list of Spotify artists matching the query.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q')?.trim();
  const limitParam = searchParams.get('limit');

  // Validate query
  if (!q || q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      { error: 'Query too short', code: 'QUERY_TOO_SHORT' },
      { status: 400 }
    );
  }

  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: 'Query too long', code: 'QUERY_TOO_LONG' },
      { status: 400 }
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

  // Rate limiting
  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  // Check cache first
  const cacheKey = `${q.toLowerCase()}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return NextResponse.json(cached.data);
  }

  try {
    const artists = await searchSpotifyArtists(q, limit);

    // Normalize response shape
    const results: SpotifyArtistResult[] = artists.map(
      (artist: SpotifyArtistApi) => ({
        id: artist.id,
        name: artist.name,
        url: buildSpotifyArtistUrl(artist.id),
        imageUrl: artist.images?.[0]?.url,
        followers: artist.followers?.total,
        popularity: artist.popularity,
        // Spotify doesn't expose verified status via search API; omit or set undefined
        verified: undefined,
      })
    );

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

    return NextResponse.json(results);
  } catch {
    return NextResponse.json(
      { error: 'Search failed', code: 'SEARCH_FAILED' },
      { status: 500 }
    );
  }
}
