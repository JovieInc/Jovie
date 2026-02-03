/**
 * ISRC Lookup Route (/r/isrc/{isrc})
 *
 * Looks up a track by its ISRC code and redirects to the canonical URL.
 * ISRC (International Standard Recording Code) is a 12-character alphanumeric code
 * that uniquely identifies sound recordings.
 *
 * Format: CC-XXX-YY-NNNNN (e.g., USRC17607839)
 * - CC: Country code (2 chars)
 * - XXX: Registrant code (3 chars)
 * - YY: Year of reference (2 digits)
 * - NNNNN: Designation code (5 digits)
 */

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { discogTracks } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { createRateLimitHeaders, publicVisitLimiter } from '@/lib/rate-limit';
import { extractClientIP } from '@/lib/utils/ip-extraction';

// ISRC format: 12 alphanumeric characters (dashes are optional and stripped)
const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/i;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Public endpoint for resolving ISRC -> canonical smartlink URL.
 * Protected by IP-based rate limiting via checkPublicRateLimit().
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ isrc: string }> }
) {
  // Public rate limiting check (per-IP) before any DB access
  const clientIP = extractClientIP(request.headers);
  const rateLimitResult = await publicVisitLimiter.limit(clientIP);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          ...createRateLimitHeaders(rateLimitResult),
        },
      }
    );
  }

  const { isrc } = await params;

  // Normalize ISRC: remove dashes and uppercase
  const normalizedIsrc = isrc.replaceAll('-', '').toUpperCase();

  // Validate ISRC format
  if (!ISRC_PATTERN.test(normalizedIsrc)) {
    return new NextResponse('Invalid ISRC format', { status: 400 });
  }

  // Look up track + creator handle in one query
  const [record] = await db
    .select({
      slug: discogTracks.slug,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(discogTracks)
    .innerJoin(
      creatorProfiles,
      eq(creatorProfiles.id, discogTracks.creatorProfileId)
    )
    .where(eq(discogTracks.isrc, normalizedIsrc))
    .limit(1);

  if (!record?.usernameNormalized) {
    return new NextResponse('Track not found', { status: 404 });
  }

  // Build canonical URL and redirect
  const canonicalUrl = new URL(
    `/${record.usernameNormalized}/${record.slug}`,
    request.url
  );

  return NextResponse.redirect(canonicalUrl, {
    status: 301, // Permanent redirect
    headers: {
      'Cache-Control': 'public, max-age=86400', // Cache for 1 day
    },
  });
}
