/**
 * Shared request utilities for promo download API routes.
 */

import type { NextRequest } from 'next/server';

/**
 * Extract geo data from Vercel/Cloudflare request headers.
 * Always decodes the URL-encoded city header.
 */
export function extractGeoFromHeaders(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const country = request.headers.get('x-vercel-ip-country') ?? null;
  const rawCity = request.headers.get('x-vercel-ip-city');
  const city = rawCity ? decodeURIComponent(rawCity) : null;
  const userAgent = request.headers.get('user-agent') ?? null;

  return { ip, country, city, userAgent };
}
