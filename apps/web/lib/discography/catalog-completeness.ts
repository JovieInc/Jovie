import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { publicReleaseEligibilitySqlPredicate } from '@/lib/profile/public-release-eligibility';
import { syncReleasesFromSpotify } from './spotify-import';

/**
 * Catalog completeness job. For each claimed artist with a Spotify id it
 *  1. publishes ingested releases whose approval was never set by the artist
 *     (no approval row, or an untouched default draft row), because a release
 *     that exists but is not approved is invisible on the public profile;
 *  2. re-runs the provider catalog import (idempotent; identity-safe after the
 *     same-title merge fix) so missing release versions are created;
 *  3. reports public-release counts before and after.
 * Artist choices are preserved: only rows with no deliberate approval change
 * are published. Work is bounded per run; Spotify retry/circuit-breaker limits
 * in the Spotify client govern provider pressure.
 */

export const CATALOG_COMPLETENESS_STATE_KEY = 'catalogCompleteness';

export interface CatalogCompletenessProfileReport {
  readonly handle: string;
  readonly publicBefore: number;
  readonly publicAfter: number;
  readonly approvalsPublished: number;
  readonly imported: number;
  readonly importFailed: number;
  readonly spotifyTotal: number;
  readonly error?: string;
}

async function countPublicReleases(creatorProfileId: string): Promise<number> {
  const [row] = await db
    .select({ n: drizzleSql<number>`count(*)::int` })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        publicReleaseEligibilitySqlPredicate()
      )
    );
  return row?.n ?? 0;
}

/** Publish ingested releases the artist never decided on. Returns the count. */
export async function publishUndecidedIngestedReleases(
  creatorProfileId: string
): Promise<number> {
  const inserted = await db.execute(drizzleSql`
    INSERT INTO library_asset_approval_statuses
      (creator_profile_id, asset_id, item_kind, approval_status, profile_visibility)
    SELECT r.creator_profile_id, r.id::text, 'release', 'approved', 'visible'
    FROM discog_releases r
    WHERE r.creator_profile_id = ${creatorProfileId}
      AND r.deleted_at IS NULL
      AND r.status <> 'draft'
      AND r.source_type = 'ingested'
      AND NOT EXISTS (
        SELECT 1 FROM library_asset_approval_statuses a
        WHERE a.creator_profile_id = r.creator_profile_id AND a.asset_id = r.id::text
      )
    ON CONFLICT DO NOTHING
    RETURNING 1
  `);
  const updated = await db.execute(drizzleSql`
    UPDATE library_asset_approval_statuses a
    SET approval_status = 'approved', profile_visibility = 'visible', updated_at = now()
    FROM discog_releases r
    WHERE a.creator_profile_id = ${creatorProfileId}
      AND a.asset_id = r.id::text
      AND r.creator_profile_id = a.creator_profile_id
      AND r.deleted_at IS NULL
      AND r.status <> 'draft'
      AND r.source_type = 'ingested'
      AND a.approval_status = 'draft'
      AND a.updated_at = a.created_at
    RETURNING 1
  `);
  return (inserted.rows?.length ?? 0) + (updated.rows?.length ?? 0);
}

export async function runCatalogCompletenessForProfile(profile: {
  readonly id: string;
  readonly username: string;
}): Promise<CatalogCompletenessProfileReport> {
  const base = {
    handle: profile.username,
    publicBefore: 0,
    publicAfter: 0,
    approvalsPublished: 0,
    imported: 0,
    importFailed: 0,
    spotifyTotal: 0,
  };
  try {
    const publicBefore = await countPublicReleases(profile.id);
    const approvalsPublished = await publishUndecidedIngestedReleases(
      profile.id
    );
    const sync = await syncReleasesFromSpotify(profile.id, {
      includeTracks: true,
    });
    const publicAfter = await countPublicReleases(profile.id);
    return {
      ...base,
      publicBefore,
      publicAfter,
      approvalsPublished,
      imported: sync.imported,
      importFailed: sync.failed,
      spotifyTotal: sync.total,
    };
  } catch (error) {
    await captureError('Catalog completeness failed for profile', error, {
      source: 'catalog_completeness',
      creatorProfileId: profile.id,
    });
    return { ...base, error: error instanceof Error ? error.message : 'error' };
  }
}

/**
 * Process the stalest profiles until the time budget is spent (provider
 * pressure is bounded by the Spotify client's rate-limit handling and circuit
 * breaker, not by a fixed count). Never-checked profiles go first.
 * `handles` (optional) restricts and orders the run, e.g. ['tim'] goes first.
 */
export async function runCatalogCompleteness(options: {
  /** Stop starting new profiles after this many ms (route budget minus slack). */
  readonly budgetMs: number;
  readonly handles?: readonly string[];
  readonly now?: Date;
}): Promise<{
  readonly profiles: CatalogCompletenessProfileReport[];
  readonly totals: {
    readonly profiles: number;
    readonly publicBefore: number;
    readonly publicAfter: number;
    readonly approvalsPublished: number;
    readonly imported: number;
    readonly failed: number;
  };
}> {
  const now = options.now ?? new Date();
  const handleFilter =
    options.handles && options.handles.length > 0
      ? drizzleSql`AND lower(username) = ANY(${options.handles.map(h => h.toLowerCase())})`
      : drizzleSql``;
  const rows = await db.execute<{ id: string; username: string }>(drizzleSql`
    SELECT id, username FROM ${creatorProfiles}
    WHERE spotify_id IS NOT NULL AND is_claimed = true ${handleFilter}
    ORDER BY (settings -> ${CATALOG_COMPLETENESS_STATE_KEY} ->> 'checkedAt') ASC NULLS FIRST,
             updated_at DESC
    LIMIT 50
  `);

  const profiles: CatalogCompletenessProfileReport[] = [];
  const started = Date.now();
  for (const profile of rows.rows) {
    if (Date.now() - started > options.budgetMs) break;
    const report = await runCatalogCompletenessForProfile(profile);
    profiles.push(report);
    // Stamp even on failure so one bad profile cannot starve the queue.
    await db
      .update(creatorProfiles)
      .set({
        settings: drizzleSql`jsonb_set(coalesce(${creatorProfiles.settings}, '{}'::jsonb), ARRAY[${CATALOG_COMPLETENESS_STATE_KEY}], ${JSON.stringify({ checkedAt: now.toISOString(), publicBefore: report.publicBefore, publicAfter: report.publicAfter })}::jsonb)`,
      })
      .where(eq(creatorProfiles.id, profile.id));
  }

  const sum = (pick: (r: CatalogCompletenessProfileReport) => number) =>
    profiles.reduce((acc, r) => acc + pick(r), 0);
  return {
    profiles,
    totals: {
      profiles: profiles.length,
      publicBefore: sum(r => r.publicBefore),
      publicAfter: sum(r => r.publicAfter),
      approvalsPublished: sum(r => r.approvalsPublished),
      imported: sum(r => r.imported),
      failed: sum(r => r.importFailed),
    },
  };
}
