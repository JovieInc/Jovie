/**
 * Re-enrichment service for under-enriched discographies
 *
 * Profiles imported before MusicFetch integration (2026-02-14) only have
 * Spotify, Apple Music, and Deezer links. This module re-runs the full
 * discovery pipeline to populate the remaining ~12 DSPs via MusicFetch
 * and generate search fallback URLs.
 */

import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { logger } from '@/lib/utils/logger';

import { discoverLinksForRelease } from './discovery';
import { getReleasesForProfile } from './queries';

// ============================================================================
// Types
// ============================================================================

export interface ReEnrichResult {
  profileId: string;
  releasesProcessed: number;
  linksDiscovered: number;
  previewsBackfilled: number;
  errors: string[];
}

export interface UnderEnrichedProfile {
  creatorProfileId: string;
  displayName: string | null;
  releaseCount: number;
  avgProviderCount: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Delay between releases to respect MusicFetch rate limit (6 req/min) */
const INTER_RELEASE_DELAY_MS = 11_000;

/** Maximum profiles to process in a single sweep */
const MAX_PROFILES_PER_SWEEP = 10;

/**
 * Minimum distinct canonical providers a release should have.
 * Profiles with releases averaging below this are considered under-enriched.
 */
const MIN_CANONICAL_PROVIDERS = 5;

// ============================================================================
// Core Re-Enrichment
// ============================================================================

/**
 * Re-enrich all releases for a creator profile.
 *
 * Runs the full discovery pipeline (MusicFetch + Apple Music + Deezer +
 * search fallbacks) for each release, respecting rate limits.
 */
export async function reEnrichProfile(
  creatorProfileId: string
): Promise<ReEnrichResult> {
  const result: ReEnrichResult = {
    profileId: creatorProfileId,
    releasesProcessed: 0,
    linksDiscovered: 0,
    previewsBackfilled: 0,
    errors: [],
  };

  const importedReleases = await getReleasesForProfile(creatorProfileId);

  if (importedReleases.length === 0) {
    return result;
  }

  for (let i = 0; i < importedReleases.length; i++) {
    const release = importedReleases[i];

    try {
      // Filter out search_fallback links — they should be upgraded to canonical
      const existingProviders = release.providerLinks
        .filter(l => {
          const meta = l.metadata as Record<string, unknown> | null;
          return meta?.discoveredFrom !== 'search_fallback';
        })
        .map(l => l.providerId);

      const discoveryResult = await discoverLinksForRelease(
        release.id,
        existingProviders,
        { skipExisting: true, storefront: 'us' }
      );

      result.releasesProcessed++;
      result.linksDiscovered += discoveryResult.discovered.length;
      result.previewsBackfilled += discoveryResult.previewsBackfilled;

      if (discoveryResult.errors.length > 0) {
        for (const error of discoveryResult.errors) {
          result.errors.push(`${release.title}: ${error}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`${release.title}: ${message}`);
      Sentry.addBreadcrumb({
        category: 're-enrich',
        message: `Re-enrichment failed for release ${release.title}`,
        level: 'warning',
        data: { releaseId: release.id, error: message },
      });
    }

    // Rate limit: wait between releases (skip after last release)
    if (i < importedReleases.length - 1) {
      await new Promise(resolve => setTimeout(resolve, INTER_RELEASE_DELAY_MS));
    }
  }

  logger.info('Re-enrichment completed', {
    profileId: creatorProfileId,
    releasesProcessed: result.releasesProcessed,
    linksDiscovered: result.linksDiscovered,
    errors: result.errors.length,
  });

  return result;
}

// ============================================================================
// Under-Enriched Profile Discovery
// ============================================================================

/**
 * Find profiles whose releases have fewer canonical provider links than expected.
 *
 * A profile is "under-enriched" if its releases average fewer than
 * MIN_CANONICAL_PROVIDERS distinct canonical (non-search_fallback) provider links.
 */
export async function findUnderEnrichedProfiles(options?: {
  limit?: number;
}): Promise<UnderEnrichedProfile[]> {
  const limit = options?.limit ?? MAX_PROFILES_PER_SWEEP;

  const results = await db.execute(drizzleSql`
    WITH release_provider_counts AS (
      SELECT
        r.creator_profile_id,
        r.id AS release_id,
        COUNT(DISTINCT pl.provider_id) AS provider_count
      FROM discog_releases r
      LEFT JOIN provider_links pl
        ON pl.release_id = r.id
        AND pl.owner_type = 'release'
        AND (
          pl.source_type = 'manual'
          OR (pl.metadata->>'discoveredFrom') IS NULL
          OR (pl.metadata->>'discoveredFrom') != 'search_fallback'
        )
      GROUP BY r.creator_profile_id, r.id
    )
    SELECT
      rpc.creator_profile_id,
      cp.display_name,
      COUNT(rpc.release_id)::int AS release_count,
      AVG(rpc.provider_count)::numeric(5,1) AS avg_provider_count
    FROM release_provider_counts rpc
    JOIN creator_profiles cp ON cp.id = rpc.creator_profile_id
    GROUP BY rpc.creator_profile_id, cp.display_name
    HAVING AVG(rpc.provider_count) < ${MIN_CANONICAL_PROVIDERS}
    ORDER BY AVG(rpc.provider_count) ASC
    LIMIT ${limit}
  `);

  return results.rows.map(row => ({
    creatorProfileId: row.creator_profile_id as string,
    displayName: row.display_name as string | null,
    releaseCount: row.release_count as number,
    avgProviderCount: Number(row.avg_provider_count),
  }));
}

/**
 * Sweep all under-enriched profiles and re-enrich them.
 * Processes profiles sequentially to respect API rate limits.
 */
export async function sweepUnderEnrichedProfiles(): Promise<{
  profilesProcessed: number;
  totalLinksDiscovered: number;
  errors: string[];
}> {
  const profiles = await findUnderEnrichedProfiles();
  const summary = {
    profilesProcessed: 0,
    totalLinksDiscovered: 0,
    errors: [] as string[],
  };

  logger.info('Starting under-enriched profile sweep', {
    profileCount: profiles.length,
  });

  for (const profile of profiles) {
    try {
      // Rate limit: add delay between profiles to avoid MusicFetch rate limit
      if (summary.profilesProcessed > 0) {
        await new Promise(resolve =>
          setTimeout(resolve, INTER_RELEASE_DELAY_MS)
        );
      }

      const result = await reEnrichProfile(profile.creatorProfileId);
      summary.profilesProcessed++;
      summary.totalLinksDiscovered += result.linksDiscovered;

      if (result.errors.length > 0) {
        summary.errors.push(
          ...result.errors.map(
            e => `[${profile.displayName ?? profile.creatorProfileId}] ${e}`
          )
        );
      }

      logger.info('Profile re-enrichment complete', {
        profileId: profile.creatorProfileId,
        displayName: profile.displayName,
        linksDiscovered: result.linksDiscovered,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      summary.errors.push(
        `[${profile.displayName ?? profile.creatorProfileId}] ${message}`
      );
    }
  }

  logger.info('Under-enriched profile sweep complete', summary);

  return summary;
}
