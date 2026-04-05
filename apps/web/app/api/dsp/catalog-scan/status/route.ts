import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { dspCatalogScans } from '@/lib/db/schema/dsp-catalog-scan';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { recoverStaleScan } from '@/lib/dsp-enrichment/jobs/catalog-scan';

export async function GET(request: Request) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scanId = searchParams.get('scanId');

  if (!scanId) {
    return NextResponse.json({ error: 'scanId is required' }, { status: 400 });
  }

  // Verify ownership through creatorProfiles -> users join
  const [scan] = await db
    .select({
      id: dspCatalogScans.id,
      status: dspCatalogScans.status,
      catalogIsrcCount: dspCatalogScans.catalogIsrcCount,
      dspIsrcCount: dspCatalogScans.dspIsrcCount,
      matchedCount: dspCatalogScans.matchedCount,
      unmatchedCount: dspCatalogScans.unmatchedCount,
      missingCount: dspCatalogScans.missingCount,
      coveragePct: dspCatalogScans.coveragePct,
      albumsScanned: dspCatalogScans.albumsScanned,
      tracksScanned: dspCatalogScans.tracksScanned,
      error: dspCatalogScans.error,
      startedAt: dspCatalogScans.startedAt,
      completedAt: dspCatalogScans.completedAt,
      createdAt: dspCatalogScans.createdAt,
    })
    .from(dspCatalogScans)
    .innerJoin(
      creatorProfiles,
      eq(creatorProfiles.id, dspCatalogScans.creatorProfileId)
    )
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(and(eq(dspCatalogScans.id, scanId), eq(users.clerkId, userId)))
    .limit(1);

  if (!scan) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  }

  // Check for stale-running scan and auto-fail if needed (after ownership verified)
  await recoverStaleScan(db, scanId);

  return NextResponse.json({ scan });
}
