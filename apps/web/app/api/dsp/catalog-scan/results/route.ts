import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  dspCatalogMismatches,
  dspCatalogScans,
} from '@/lib/db/schema/dsp-catalog-scan';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getBoundSpotifyArtistId } from '@/lib/dsp-enrichment/catalog-scan-target';

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

  // Verify profile ownership
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(and(eq(creatorProfiles.id, profileId), eq(users.id, userId)))
    .limit(1);

  if (!profile) {
    return NextResponse.json(
      { error: 'Profile not found or not authorized' },
      { status: 403 }
    );
  }

  const boundArtistId = await getBoundSpotifyArtistId(db, profileId);
  // A newer failed/pending observation must not expose an older all-clear.
  const [latestScan] = await db
    .select()
    .from(dspCatalogScans)
    .where(
      and(
        eq(dspCatalogScans.creatorProfileId, profileId),
        eq(dspCatalogScans.providerId, 'spotify')
      )
    )
    .orderBy(desc(dspCatalogScans.createdAt), desc(dspCatalogScans.id))
    .limit(1);

  if (!latestScan) {
    return NextResponse.json({
      scan: null,
      mismatches: [],
      message: 'No scan found',
    });
  }

  if (!boundArtistId || latestScan.externalArtistId !== boundArtistId) {
    return NextResponse.json({
      scan: {
        ...latestScan,
        status: 'failed',
        error:
          'The Spotify connection changed. Previous scan results are historical; current catalog health is unverified.',
      },
      mismatches: [],
    });
  }

  // Retain triage history for this provider and bound artist.
  const mismatches = await db
    .select({ mismatch: dspCatalogMismatches })
    .from(dspCatalogMismatches)
    .innerJoin(
      dspCatalogScans,
      eq(dspCatalogScans.id, dspCatalogMismatches.scanId)
    )
    .where(
      and(
        eq(dspCatalogMismatches.creatorProfileId, profileId),
        eq(dspCatalogScans.providerId, 'spotify'),
        eq(dspCatalogScans.externalArtistId, boundArtistId)
      )
    )
    .orderBy(dspCatalogMismatches.status, desc(dspCatalogMismatches.updatedAt));

  return NextResponse.json({
    scan: latestScan,
    mismatches: mismatches.map(row => row.mismatch),
  });
}
