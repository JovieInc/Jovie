import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import {
  dspCatalogMismatches,
  dspCatalogScans,
} from '@/lib/db/schema/dsp-catalog-scan';

export async function GET(request: Request) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get('profileId');

  if (!profileId) {
    return NextResponse.json(
      { error: 'profileId is required' },
      { status: 400 }
    );
  }

  // Get latest completed scan for this profile
  const [latestScan] = await db
    .select()
    .from(dspCatalogScans)
    .where(
      and(
        eq(dspCatalogScans.creatorProfileId, profileId),
        eq(dspCatalogScans.providerId, 'spotify'),
        eq(dspCatalogScans.status, 'completed')
      )
    )
    .orderBy(desc(dspCatalogScans.completedAt))
    .limit(1);

  if (!latestScan) {
    return NextResponse.json({
      scan: null,
      mismatches: [],
      message: 'No completed scan found',
    });
  }

  // Get all mismatches for this profile (across all scans, using dedup key)
  const mismatches = await db
    .select()
    .from(dspCatalogMismatches)
    .where(eq(dspCatalogMismatches.creatorProfileId, profileId))
    .orderBy(dspCatalogMismatches.status, desc(dspCatalogMismatches.updatedAt));

  return NextResponse.json({
    scan: latestScan,
    mismatches,
  });
}
