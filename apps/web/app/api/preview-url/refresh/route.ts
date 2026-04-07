import { NextResponse } from 'next/server';
import { lookupDeezerByIsrc } from '@/lib/discography/provider-links';
import {
  apiLimiter,
  createRateLimitHeaders,
  getClientIP,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';

const ISRC_REGEX = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

/**
 * GET /api/preview-url/refresh?isrc=XXXXXXXXXXXX
 *
 * Fetches a fresh preview URL from Deezer for the given ISRC.
 * Deezer preview URLs are time-limited (expire within hours),
 * so this endpoint provides on-demand refresh when stored URLs expire.
 *
 * No authentication required — Deezer's API is public and ISRCs are not sensitive.
 * Rate limited to 100 req/min per IP via the shared API limiter.
 */
export async function GET(request: Request) {
  // Rate limit by IP to prevent abuse
  const ip = getClientIP(request);
  const rateLimitResult = await apiLimiter.limit(ip);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
    );
  }

  const { searchParams } = new URL(request.url);
  const isrc = searchParams.get('isrc')?.trim().toUpperCase();

  if (!isrc || !ISRC_REGEX.test(isrc)) {
    return NextResponse.json(
      { error: 'Invalid or missing ISRC parameter' },
      { status: 400 }
    );
  }

  const result = await lookupDeezerByIsrc(isrc);

  if (!result?.previewUrl) {
    return NextResponse.json(
      { previewUrl: null, source: null },
      {
        headers: {
          'Cache-Control': 'private, max-age=300',
        },
      }
    );
  }

  return NextResponse.json(
    { previewUrl: result.previewUrl, source: 'deezer' },
    {
      headers: {
        'Cache-Control': 'private, max-age=600',
      },
    }
  );
}
