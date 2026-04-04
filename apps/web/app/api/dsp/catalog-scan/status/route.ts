import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { dspCatalogScans } from '@/lib/db/schema/dsp-catalog-scan';
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

  // Check for stale-running scan and auto-fail if needed
  await recoverStaleScan(db, scanId);

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
    .where(eq(dspCatalogScans.id, scanId))
    .limit(1);

  if (!scan) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  }

  return NextResponse.json({ scan });
}
