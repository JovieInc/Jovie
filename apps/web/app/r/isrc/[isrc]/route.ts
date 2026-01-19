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
import { creatorProfiles, discogTracks } from '@/lib/db/schema';

// ISRC format: 12 alphanumeric characters (dashes are optional and stripped)
const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ isrc: string }> }
) {
  const { isrc } = await params;

  // Normalize ISRC: remove dashes and uppercase
  const normalizedIsrc = isrc.replace(/-/g, '').toUpperCase();

  // Validate ISRC format
  if (!ISRC_PATTERN.test(normalizedIsrc)) {
    return new NextResponse('Invalid ISRC format', { status: 400 });
  }

  // Look up track by ISRC
  const [track] = await db
    .select({
      slug: discogTracks.slug,
      creatorProfileId: discogTracks.creatorProfileId,
    })
    .from(discogTracks)
    .where(eq(discogTracks.isrc, normalizedIsrc))
    .limit(1);

  if (!track) {
    return new NextResponse('Track not found', { status: 404 });
  }

  // Get creator handle
  const [creator] = await db
    .select({ usernameNormalized: creatorProfiles.usernameNormalized })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, track.creatorProfileId))
    .limit(1);

  if (!creator) {
    return new NextResponse('Creator not found', { status: 404 });
  }

  // Build canonical URL and redirect
  const canonicalUrl = new URL(
    `/${creator.usernameNormalized}/${track.slug}`,
    request.url
  );

  return NextResponse.redirect(canonicalUrl, {
    status: 301, // Permanent redirect
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
    },
  });
}
