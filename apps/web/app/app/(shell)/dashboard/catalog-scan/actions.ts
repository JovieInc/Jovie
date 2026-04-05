'use server';

import { and, desc, eq, or } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import {
  type DspCatalogMismatch,
  type DspCatalogScan,
  dspCatalogMismatches,
  dspCatalogScans,
} from '@/lib/db/schema/dsp-catalog-scan';

export type { DspCatalogMismatch } from '@/lib/db/schema/dsp-catalog-scan';

export interface CatalogScanPageData {
  profileId: string;
  spotifyId: string | null;
  latestScan: DspCatalogScan | null;
  mismatches: DspCatalogMismatch[];
  pendingScan: { id: string; status: string } | null;
}

export async function loadCatalogScanData(): Promise<CatalogScanPageData> {
  const data = await getDashboardData();

  if (data.needsOnboarding && !data.dashboardLoadError) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  const profile = data.selectedProfile;
  if (!profile) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  const spotifyId = profile.spotifyId ?? null;

  // Check for pending/running scan
  const [pendingScan] = await db
    .select({ id: dspCatalogScans.id, status: dspCatalogScans.status })
    .from(dspCatalogScans)
    .where(
      and(
        eq(dspCatalogScans.creatorProfileId, profile.id),
        eq(dspCatalogScans.providerId, 'spotify'),
        or(
          eq(dspCatalogScans.status, 'pending'),
          eq(dspCatalogScans.status, 'running')
        )
      )
    )
    .limit(1);

  // Get latest completed or failed scan (so UI can show error state)
  const [latestScan] = await db
    .select()
    .from(dspCatalogScans)
    .where(
      and(
        eq(dspCatalogScans.creatorProfileId, profile.id),
        eq(dspCatalogScans.providerId, 'spotify'),
        or(
          eq(dspCatalogScans.status, 'completed'),
          eq(dspCatalogScans.status, 'failed')
        )
      )
    )
    .orderBy(desc(dspCatalogScans.completedAt))
    .limit(1);

  // Only fetch mismatches for completed scans (failed scans have none)
  const mismatches =
    latestScan?.status === 'completed'
      ? await db
          .select()
          .from(dspCatalogMismatches)
          .where(eq(dspCatalogMismatches.creatorProfileId, profile.id))
          .orderBy(
            dspCatalogMismatches.status,
            desc(dspCatalogMismatches.updatedAt)
          )
      : [];

  return {
    profileId: profile.id,
    spotifyId,
    latestScan: latestScan ?? null,
    mismatches,
    pendingScan: pendingScan ?? null,
  };
}
