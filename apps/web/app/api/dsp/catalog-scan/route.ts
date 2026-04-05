import { and, desc, eq, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { dspCatalogScans } from '@/lib/db/schema/dsp-catalog-scan';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { processCatalogScanStandalone } from '@/lib/dsp-enrichment/jobs/catalog-scan';

const triggerScanSchema = z.object({
  profileId: z.string().uuid(),
  spotifyArtistId: z.string().min(1),
});

export async function POST(request: Request) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = triggerScanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { profileId, spotifyArtistId } = parsed.data;

  // Verify profile ownership
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(and(eq(creatorProfiles.id, profileId), eq(users.clerkId, userId)))
    .limit(1);

  if (!profile) {
    return NextResponse.json(
      { error: 'Profile not found or not authorized' },
      { status: 403 }
    );
  }

  // Check for existing pending/running scan
  const [existingScan] = await db
    .select({ id: dspCatalogScans.id, status: dspCatalogScans.status })
    .from(dspCatalogScans)
    .where(
      and(
        eq(dspCatalogScans.creatorProfileId, profileId),
        eq(dspCatalogScans.providerId, 'spotify'),
        or(
          eq(dspCatalogScans.status, 'pending'),
          eq(dspCatalogScans.status, 'running')
        )
      )
    )
    .limit(1);

  if (existingScan) {
    return NextResponse.json({
      success: true,
      scanId: existingScan.id,
      status: existingScan.status,
      message: 'Scan already in progress',
    });
  }

  // Check for recent completed scan (rate limit: 1 per hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [recentScan] = await db
    .select({
      id: dspCatalogScans.id,
      completedAt: dspCatalogScans.completedAt,
    })
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

  if (recentScan?.completedAt && recentScan.completedAt > oneHourAgo) {
    const retryAfter = Math.ceil(
      (recentScan.completedAt.getTime() + 3600000 - Date.now()) / 1000
    );
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: 'Please wait before triggering another scan.',
        retryAfter,
      },
      { status: 429 }
    );
  }

  // Create scan row
  const [scan] = await db
    .insert(dspCatalogScans)
    .values({
      creatorProfileId: profileId,
      providerId: 'spotify',
      externalArtistId: spotifyArtistId,
      status: 'pending',
    })
    .returning({ id: dspCatalogScans.id });

  // Process scan in background (fire and forget)
  void processCatalogScanStandalone({
    creatorProfileId: profileId,
    spotifyArtistId,
    scanId: scan.id,
  }).catch(error => {
    console.error('[catalog-scan] Background scan failed:', error);
  });

  return NextResponse.json({
    success: true,
    scanId: scan.id,
    status: 'pending',
    message: 'Catalog scan started',
  });
}
