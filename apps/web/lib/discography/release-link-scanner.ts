/**
 * Release Link Scanner
 *
 * Smart rescanning logic for DSP link discovery.
 * Increases scan frequency around release dates (like feature.fm/linkfire).
 *
 * Scan schedule per release:
 *   On creation       → immediate scan
 *   7 days before     → daily
 *   3 days before     → every 6 hours
 *   Release day       → every 2 hours
 *   Days 1-3 post     → every 6 hours
 *   Days 4-14 post    → daily
 *   After 14 days     → completed (stop scanning)
 */

import { and, eq, lte, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases, providerLinks } from '@/lib/db/schema/content';
import { releaseLinkScans } from '@/lib/db/schema/dsp-enrichment';
import { logger } from '@/lib/utils/logger';
import { discoverLinksForRelease } from './discovery';

/** Minimum number of providers before we consider scanning "complete" */
const MIN_PROVIDERS_FOR_COMPLETE = 5;

/** Maximum number of scans before force-completing */
const MAX_SCANS = 100;

type ScanPhase =
  | 'immediate'
  | 'pre_release'
  | 'release_window'
  | 'post_release'
  | 'completed';

/**
 * Determine the scan phase based on release date and current time.
 */
function determineScanPhase(releaseDate: Date | null, now: Date): ScanPhase {
  if (!releaseDate) return 'post_release'; // No date, treat as already released

  const msUntilRelease = releaseDate.getTime() - now.getTime();
  const daysUntilRelease = msUntilRelease / (1000 * 60 * 60 * 24);

  if (daysUntilRelease > 7) return 'pre_release';
  if (daysUntilRelease > 0) return 'release_window';
  if (daysUntilRelease > -14) return 'post_release';
  return 'completed';
}

/**
 * Calculate the next scan time based on phase and release date.
 */
function calculateNextScanTime(
  phase: ScanPhase,
  releaseDate: Date | null,
  now: Date
): Date | null {
  if (phase === 'completed') return null;

  if (!releaseDate) {
    // No release date: scan daily for up to 14 days
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  const msUntilRelease = releaseDate.getTime() - now.getTime();
  const daysUntilRelease = msUntilRelease / (1000 * 60 * 60 * 24);

  if (daysUntilRelease > 7) {
    // More than 7 days out: scan daily
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  if (daysUntilRelease > 3) {
    // 3-7 days out: scan daily
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  if (daysUntilRelease > 0) {
    // 0-3 days before: scan every 6 hours
    return new Date(now.getTime() + 6 * 60 * 60 * 1000);
  }

  const daysSinceRelease = -daysUntilRelease;

  if (daysSinceRelease <= 1) {
    // Release day: scan every 2 hours
    return new Date(now.getTime() + 2 * 60 * 60 * 1000);
  }

  if (daysSinceRelease <= 3) {
    // 1-3 days post: scan every 6 hours
    return new Date(now.getTime() + 6 * 60 * 60 * 1000);
  }

  if (daysSinceRelease <= 14) {
    // 4-14 days post: scan daily
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  // After 14 days: stop
  return null;
}

/**
 * Process all due release link scans.
 * Called by the cron job every 30 minutes.
 */
export async function processReleaseLinkScans(): Promise<{
  scanned: number;
  completed: number;
  errors: number;
}> {
  const now = new Date();
  let scanned = 0;
  let completed = 0;
  let errors = 0;

  // Find all scans that are due
  const dueScans = await db
    .select({
      scan: releaseLinkScans,
      releaseDate: discogReleases.releaseDate,
    })
    .from(releaseLinkScans)
    .innerJoin(
      discogReleases,
      eq(releaseLinkScans.releaseId, discogReleases.id)
    )
    .where(
      and(
        lte(releaseLinkScans.nextScanAt, now),
        ne(releaseLinkScans.scanPhase, 'completed')
      )
    )
    .limit(50); // Process at most 50 per run to stay within timeout

  for (const { scan, releaseDate } of dueScans) {
    try {
      // Get existing providers for this release
      const existingProviders = await getProviderLinksForRelease(
        scan.releaseId
      );
      const existingProviderIds = existingProviders.map(p => p.providerId);

      // Attempt to discover new links
      await discoverLinksForRelease(scan.releaseId, existingProviderIds);

      // Re-count providers after discovery
      const updatedProviders = await getProviderLinksForRelease(scan.releaseId);
      const providersFound = updatedProviders.length;

      // Determine next phase and scan time
      const newPhase = determineScanPhase(releaseDate, now);
      const shouldComplete =
        newPhase === 'completed' ||
        providersFound >= MIN_PROVIDERS_FOR_COMPLETE ||
        scan.totalScans + 1 >= MAX_SCANS;

      const nextScanAt = shouldComplete
        ? null
        : calculateNextScanTime(newPhase, releaseDate, now);

      const finalPhase = shouldComplete ? 'completed' : newPhase;

      await db
        .update(releaseLinkScans)
        .set({
          scanPhase: finalPhase,
          nextScanAt,
          lastScanAt: now,
          providersFound,
          totalScans: scan.totalScans + 1,
          updatedAt: now,
        })
        .where(eq(releaseLinkScans.id, scan.id));

      scanned++;
      if (finalPhase === 'completed') completed++;
    } catch (error) {
      errors++;
      logger.error(
        `[release-link-scanner] Failed to scan release ${scan.releaseId}:`,
        error
      );
    }
  }

  return { scanned, completed, errors };
}

/**
 * Get provider links for a release (helper).
 */
async function getProviderLinksForRelease(releaseId: string) {
  const links = await db
    .select()
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.ownerType, 'release'),
        eq(providerLinks.releaseId, releaseId)
      )
    );
  return links;
}
