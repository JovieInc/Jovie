import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { merchCards } from '@/lib/db/schema/merch';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { publicEnv } from '@/lib/env-public';
import { captureError } from '@/lib/error-tracking';
import {
  CORS_HEADERS,
  NO_STORE_HEADERS,
  SHORT_CACHE_HEADERS,
} from '@/lib/http/headers';
import { buildMerchAvailabilityResponse } from '@/lib/merch/availability';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const skuSchema = z.string().uuid();

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly sku: string }> }
) {
  const { sku } = await params;

  if (!skuSchema.safeParse(sku).success) {
    return NextResponse.json(
      { error: 'Invalid SKU' },
      { status: 400, headers: { ...NO_STORE_HEADERS, ...CORS_HEADERS } }
    );
  }

  try {
    const [row] = await db
      .select({
        card: merchCards,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(merchCards)
      .innerJoin(
        creatorProfiles,
        eq(creatorProfiles.id, merchCards.creatorProfileId)
      )
      .where(
        and(
          eq(merchCards.id, sku),
          eq(merchCards.status, 'live'),
          eq(creatorProfiles.isPublic, true)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: { ...NO_STORE_HEADERS, ...CORS_HEADERS } }
      );
    }

    const baseUrl = publicEnv.NEXT_PUBLIC_PROFILE_URL || 'https://jov.ie';
    const payload = buildMerchAvailabilityResponse(
      row.card,
      row.usernameNormalized,
      baseUrl
    );

    return NextResponse.json(payload, {
      status: 200,
      headers: { ...SHORT_CACHE_HEADERS, ...CORS_HEADERS },
    });
  } catch (error) {
    logger.error('[merch] Availability lookup failed', { sku, error });
    void captureError('Merch availability lookup failed', error, {
      route: '/api/merch/[sku]/availability',
      sku,
    });
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: { ...NO_STORE_HEADERS, ...CORS_HEADERS } }
    );
  }
}
