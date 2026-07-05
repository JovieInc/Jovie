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
import { and, sql as drizzleSql, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { discogReleases, providerLinks } from '@/lib/db/schema/content';
import { logger } from '@/lib/utils/logger';

import { discoverLinksForRelease } from './discovery';
import { getReleasesForProfile, type ReleaseWithProviders } from './queries';

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

export interface ReEnrichProfileOptions {
  /** Cap releases processed; uses under-enriched release query when set */
  releaseLimit?: number;
}

export interface SweepUnderEnrichedOptions {
  profileLimit?: number;
  releaseLimit?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Delay between releases to respect MusicFetch rate limit (6 req/min) */
const INTER_RELEASE_DELAY_MS = 11_000;

/** Maximum profiles to discover in a single sweep query */
export const MAX_PROFILES_PER_SWEEP = 10;

/** Maximum profiles to process in one sweep invocation (admin/manual) */
export const MAX_PROFILES_PER_SWEEP_RUN = 5;

/** Maximum releases to re-enrich per profile in one sweep invocation */
export const MAX_RELEASES_PER_PROFILE_SWEEP = 10;

/** Cron sub-job limits — conservative for shared daily-maintenance budget */
export const MAX_PROFILES_PER_CRON_SWEEP = 1;
export const MAX_RELEASES_PER_PROFILE_CRON_SWEEP = 4;

/**
 * Minimum distinct canonical providers a release should have.
 * Profiles with releases averaging below this are considered under-enriched.
 */
export const MIN_CANONICAL_PROVIDERS = 5;

// ============================================================================
// Core Re-Enrichment
// ============================================================================

/**
 * Fetch a bounded batch of under-enriched releases for a profile.
 * Orders worst-first (fewest canonical providers) so each cron tick makes progress.
 */
export async function getUnderEnrichedReleasesForProfile(
  creatorProfileId: string,
  limit: number
): Promise<ReleaseWithProviders[]> {
  const releaseIdRows = await db.execute(drizzleSql`
    SELECT
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
    WHERE r.creator_profile_id = ${creatorProfileId}
      AND r.deleted_at IS NULL
    GROUP BY r.id
    HAVING COUNT(DISTINCT pl.provider_id) < ${MIN_CANONICAL_PROVIDERS}
    ORDER BY COUNT(DISTINCT pl.provider_id) ASC, r.release_date ASC NULLS LAST
    LIMIT ${limit}
  `);

  const releaseIds = releaseIdRows.rows.map(row => row.release_id as string);
  if (releaseIds.length === 0) {
    return [];
  }

  const releases = await db
    .select()
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        inArray(discogReleases.id, releaseIds),
        isNull(discogReleases.deletedAt)
      )
    );

  const providerLinksResult = await db
    .select()
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.ownerType, 'release'),
        inArray(providerLinks.releaseId, releaseIds)
      )
    );

  const linksByRelease = new Map<string, typeof providerLinksResult>();
  for (const link of providerLinksResult) {
    if (!link.releaseId) continue;
    const existing = linksByRelease.get(link.releaseId) ?? [];
    existing.push(link);
    linksByRelease.set(link.releaseId, existing);
  }

  const releasesById = new Map(releases.map(release => [release.id, release]));

  return releaseIds
    .map(releaseId => {
      const release = releasesById.get(releaseId);
      if (!release) return null;
      return {
        ...release,
        providerLinks: linksByRelease.get(releaseId) ?? [],
      };
    })
    .filter((release): release is ReleaseWithProviders => release !== null);
}

/**
 * Re-enrich all releases for a creator profile.
 *
 * Runs the full discovery pipeline (MusicFetch + Apple Music + Deezer +
 * search fallbacks) for each release, respecting rate limits.
 */
export async function reEnrichProfile(
  creatorProfileId: string,
  options?: ReEnrichProfileOptions
): Promise<ReEnrichResult> {
  const result: ReEnrichResult = {
    profileId: creatorProfileId,
    releasesProcessed: 0,
    linksDiscovered: 0,
    previewsBackfilled: 0,
    errors: [],
  };

  const importedReleases =
    options?.releaseLimit != null
      ? await getUnderEnrichedReleasesForProfile(
          creatorProfileId,
          options.releaseLimit
        )
      : await getReleasesForProfile(creatorProfileId, {
          includeDrafts: true,
        });

  if (importedReleases.length === 0) {
    return result;
  }

  for (let i = 0; i < importedReleases.length; i++) {
    const release = importedReleases[i];

    try {
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
 * Sweep under-enriched profiles and re-enrich them in bounded batches.
 */
export async function sweepUnderEnrichedProfiles(
  options?: SweepUnderEnrichedOptions
): Promise<{
  profilesProcessed: number;
  totalLinksDiscovered: number;
  errors: string[];
  hasMoreProfiles: boolean;
}> {
  const profileLimit = options?.profileLimit ?? MAX_PROFILES_PER_SWEEP_RUN;
  const releaseLimit = options?.releaseLimit ?? MAX_RELEASES_PER_PROFILE_SWEEP;

  const profiles = await findUnderEnrichedProfiles({
    limit: profileLimit,
  });
  const summary = {
    profilesProcessed: 0,
    totalLinksDiscovered: 0,
    errors: [] as string[],
    hasMoreProfiles: profiles.length === profileLimit,
  };

  logger.info('Starting under-enriched profile sweep', {
    profileCount: profiles.length,
    profileLimit,
    releaseLimit,
  });

  for (const profile of profiles) {
    try {
      if (summary.profilesProcessed > 0) {
        await new Promise(resolve =>
          setTimeout(resolve, INTER_RELEASE_DELAY_MS)
        );
      }

      const result = await reEnrichProfile(profile.creatorProfileId, {
        releaseLimit,
      });
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

/** Bounded sweep entry point for cron sub-jobs. */
export async function sweepUnderEnrichedProfilesForCron(): Promise<{
  profilesProcessed: number;
  totalLinksDiscovered: number;
  errors: string[];
  hasMoreProfiles: boolean;
}> {
  return sweepUnderEnrichedProfiles({
    profileLimit: MAX_PROFILES_PER_CRON_SWEEP,
    releaseLimit: MAX_RELEASES_PER_PROFILE_CRON_SWEEP,
  });
}
