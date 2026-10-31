import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { trackingEligibility } from '@/lib/tracking/eligibility';
import { trackingVisitorFromRequest } from '@/lib/tracking/eligibility.server';
import { isReservedUsername } from '@/lib/validation/username-core';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

/** Resolve the live artist behind ANY public subroute, independent of ISR/RSC. */
export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get('pathname') ?? '';
    if (!pathname.startsWith('/') || pathname.startsWith('//')) {
      return NextResponse.json({}, { status: 400, headers });
    }
    const username = decodeURIComponent(
      pathname.split('/')[1] ?? ''
    ).toLowerCase();
    const [row] = username
      ? await db
          .select({ youngAudience: creatorProfiles.youngAudience })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.usernameNormalized, username))
          .limit(1)
      : [];
    // Look up even reserved fixture handles before classifying platform routes.
    const profile =
      row ?? (!username || isReservedUsername(username) ? null : undefined);
    return NextResponse.json(
      {
        pathname,
        eligibility: trackingEligibility({
          profile,
          visitor: trackingVisitorFromRequest(request),
        }),
      },
      { headers }
    );
  } catch {
    return NextResponse.json({}, { status: 503, headers });
  }
}
