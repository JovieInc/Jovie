import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { creatorPixels } from '@/lib/db/schema/pixels';
import { checkGate, FEATURE_FLAG_KEYS } from '@/lib/feature-flags/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const querySchema = z.object({
  profileId: z.string().uuid(),
});

/**
 * GET /api/pixels/public?profileId=<uuid>
 *
 * Returns public-safe pixel IDs (no tokens/secrets) for a creator profile.
 * Used by the client-side retargeting pixel component on the tip page.
 * Gated behind the RETARGETING_PIXELS_TIP_PAGE feature flag.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    profileId: searchParams.get('profileId'),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid profileId' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // Check feature flag (use null userId since this is a public endpoint)
  const enabled = await checkGate(
    null,
    FEATURE_FLAG_KEYS.RETARGETING_PIXELS_TIP_PAGE,
    false
  );

  if (!enabled) {
    return NextResponse.json(
      { facebookPixelId: null, googleMeasurementId: null },
      { headers: { 'Cache-Control': 'public, max-age=300' } }
    );
  }

  const { profileId } = parsed.data;

  const [config] = await db
    .select({
      facebookPixelId: creatorPixels.facebookPixelId,
      facebookEnabled: creatorPixels.facebookEnabled,
      googleMeasurementId: creatorPixels.googleMeasurementId,
      googleEnabled: creatorPixels.googleEnabled,
    })
    .from(creatorPixels)
    .where(
      and(
        eq(creatorPixels.profileId, profileId),
        eq(creatorPixels.enabled, true)
      )
    )
    .limit(1);

  return NextResponse.json(
    {
      facebookPixelId: config?.facebookEnabled ? config.facebookPixelId : null,
      googleMeasurementId: config?.googleEnabled
        ? config.googleMeasurementId
        : null,
    },
    { headers: { 'Cache-Control': 'public, max-age=300' } }
  );
}
