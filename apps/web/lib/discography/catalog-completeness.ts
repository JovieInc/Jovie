import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { publicReleaseEligibilitySqlPredicate } from '@/lib/profile/public-release-eligibility';
import { getDecidedKeys, getIdentityDecisionRates } from './identity-review';
import {
  classifyPublication,
  type DecisionRate,
  providerAlbumIdOf,
  suggestAutoPublishReasons,
} from './publication-eligibility';
import { syncReleasesFromSpotify } from './spotify-import';

/**
 * Catalog completeness job. For each claimed artist with a Spotify id it
 *  1. reconciles ingested releases with no approval row: provider-verified,
 *     unambiguous ones are published under the existing import policy,
 *     ambiguous ones are queued as needs_review (no bulk publishing);
 *  2. re-runs the provider catalog import (idempotent; identity-safe after the
 *     same-title merge fix) so missing release versions are created;
 *  3. reports public-release counts before and after.
 * Artist choices are preserved: only rows with no deliberate approval change
 * are published. Work is bounded per run; Spotify retry/circuit-breaker limits
 * in the Spotify client govern provider pressure.
 */

export const CATALOG_COMPLETENESS_STATE_KEY = 'catalogCompleteness';

/**
 * Rollout flags. Comma-separated handles, or `*` for every artist. Default is
 * Tim's own profile only; widening is a product-behavior change (public by
 * default for undecided imports, co-primary appears_on imports).
 */
export const DEFAULT_ROLLOUT_HANDLES = 'tim';

export function isRolledOut(flag: string | undefined, handle: string): boolean {
  const value = (flag ?? DEFAULT_ROLLOUT_HANDLES).trim().toLowerCase();
  if (value === '*') return true;
  return value
    .split(',')
    .map(h => h.trim())
    .filter(Boolean)
    .includes(handle.toLowerCase());
}

export interface HiddenRelease {
  readonly slug: string;
  readonly title: string;
  /** Which public-eligibility conditions this release fails. */
  readonly failed: readonly string[];
}

/** Why each existing release is not public, one entry per failed condition. */
export async function diagnoseHiddenReleases(
  creatorProfileId: string
): Promise<HiddenRelease[]> {
  const result = await db.execute<{
    slug: string;
    title: string;
    status: string;
    release_date: Date | null;
    reveal_date: Date | null;
    has_artwork: boolean;
    has_link: boolean;
    approval: string | null;
    visibility: string | null;
  }>(drizzleSql`
    SELECT r.slug, r.title, r.status, r.release_date, r.reveal_date,
      NULLIF(BTRIM(r.artwork_url), '') IS NOT NULL AS has_artwork,
      EXISTS (SELECT 1 FROM provider_links l WHERE l.release_id = r.id
        AND l.owner_type = 'release' AND NULLIF(BTRIM(l.url), '') IS NOT NULL) AS has_link,
      a.approval_status::text AS approval, a.profile_visibility::text AS visibility
    FROM discog_releases r
    LEFT JOIN library_asset_approval_statuses a
      ON a.asset_id = r.id::text AND a.creator_profile_id = r.creator_profile_id
    WHERE r.creator_profile_id = ${creatorProfileId} AND r.deleted_at IS NULL
  `);
  const now = Date.now();
  const hidden: HiddenRelease[] = [];
  for (const r of result.rows) {
    const failed: string[] = [];
    if (r.status === 'draft') failed.push('status_draft');
    if (!r.release_date) failed.push('no_release_date');
    else if (
      new Date(r.release_date).getTime() > now &&
      !(r.reveal_date && new Date(r.reveal_date).getTime() <= now)
    )
      failed.push('future_release_date');
    if (!r.has_artwork) failed.push('no_artwork');
    if (!r.has_link) failed.push('no_provider_link');
    if (r.approval === null) failed.push('no_approval_row');
    else if (r.approval !== 'approved') failed.push(`approval_${r.approval}`);
    if (r.approval !== null && r.visibility !== 'visible')
      failed.push(`visibility_${r.visibility}`);
    if (failed.length > 0)
      hidden.push({ slug: r.slug, title: r.title, failed });
  }
  return hidden;
}

export interface CatalogCompletenessProfileReport {
  readonly handle: string;
  readonly publicBefore: number;
  readonly publicAfter: number;
  readonly approvalsPublished: number;
  readonly queuedForReview: number;
  readonly imported: number;
  readonly importFailed: number;
  readonly spotifyTotal: number;
  /** Releases not public before this run, and the conditions each failed. */
  readonly hiddenBefore: readonly HiddenRelease[];
  readonly published: boolean;
  readonly appearsOn: boolean;
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

/**
 * Reconcile ingested releases that have no approval row. Provider-verified,
 * unambiguous releases are published under the existing import policy;
 * ambiguous ones go to the `needs_review` queue. Releases that already have a
 * row (including artist-hidden or archived) are never touched; nothing is
 * bulk-published.
 */
export async function reconcileUndecidedIngestedReleases(
  creatorProfileId: string,
  ownerSpotifyId: string | null
): Promise<{ published: number; queuedForReview: number }> {
  const all = await db.execute<{
    id: string;
    title: string;
    release_date: Date | null;
    metadata: unknown;
    decided: boolean;
    eligible: boolean;
  }>(drizzleSql`
    SELECT r.id, r.title, r.release_date, r.metadata,
      EXISTS (SELECT 1 FROM library_asset_approval_statuses a
        WHERE a.creator_profile_id = r.creator_profile_id AND a.asset_id = r.id::text) AS decided,
      (r.status <> 'draft' AND r.source_type = 'ingested') AS eligible
    FROM discog_releases r
    WHERE r.creator_profile_id = ${creatorProfileId} AND r.deleted_at IS NULL
  `);
  const decided = await getDecidedKeys(creatorProfileId);
  const releases = all.rows.map(r => ({
    id: r.id,
    title: r.title,
    releaseDate: r.release_date ? new Date(r.release_date) : null,
    metadata: r.metadata,
  }));
  let published = 0;
  let queuedForReview = 0;
  for (const row of all.rows) {
    if (row.decided || !row.eligible) continue;
    // The artist already answered "Is this you?" for this release.
    if (decided.has(providerAlbumIdOf(row.metadata) ?? `release:${row.id}`)) {
      continue;
    }
    const candidate = releases.find(r => r.id === row.id);
    if (!candidate) continue;
    const { decision } = classifyPublication(
      candidate,
      releases,
      ownerSpotifyId
    );
    const inserted = await db.execute(drizzleSql`
      INSERT INTO library_asset_approval_statuses
        (creator_profile_id, asset_id, item_kind, approval_status, profile_visibility)
      VALUES (${creatorProfileId}, ${row.id}, 'release',
        ${decision === 'publish' ? 'approved' : 'needs_review'}, 'visible')
      ON CONFLICT DO NOTHING
      RETURNING 1`);
    if ((inserted.rows?.length ?? 0) > 0) {
      if (decision === 'publish') published++;
      else queuedForReview++;
    }
  }
  return { published, queuedForReview };
}

export async function runCatalogCompletenessForProfile(profile: {
  readonly id: string;
  readonly username: string;
  readonly spotify_id?: string | null;
}): Promise<CatalogCompletenessProfileReport> {
  const base = {
    handle: profile.username,
    publicBefore: 0,
    publicAfter: 0,
    approvalsPublished: 0,
    queuedForReview: 0,
    imported: 0,
    importFailed: 0,
    spotifyTotal: 0,
    hiddenBefore: [] as HiddenRelease[],
    published: false,
    appearsOn: false,
  };
  try {
    const publicBefore = await countPublicReleases(profile.id);
    const hiddenBefore = await diagnoseHiddenReleases(profile.id);
    const published = isRolledOut(
      process.env.CATALOG_PUBLISH_UNDECIDED_HANDLES,
      profile.username
    );
    const appearsOn = isRolledOut(
      process.env.CATALOG_APPEARS_ON_HANDLES,
      profile.username
    );
    // Import first: a re-import re-verifies legacy rows (fresh provider id and
    // credits), so only releases that stay unverified reach the prompt.
    const sync = await syncReleasesFromSpotify(profile.id, {
      includeTracks: true,
      includeCoPrimaryAppearsOn: appearsOn,
    });
    const reconciled = published
      ? await reconcileUndecidedIngestedReleases(
          profile.id,
          profile.spotify_id ?? null
        )
      : { published: 0, queuedForReview: 0 };
    const approvalsPublished = reconciled.published;
    const publicAfter = await countPublicReleases(profile.id);
    return {
      ...base,
      publicBefore,
      publicAfter,
      approvalsPublished,
      queuedForReview: reconciled.queuedForReview,
      imported: sync.imported,
      importFailed: sync.failed,
      spotifyTotal: sync.total,
      hiddenBefore,
      published,
      appearsOn,
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
    readonly queuedForReview: number;
    readonly imported: number;
    readonly failed: number;
  };
  /**
   * Measured "Is this you?" outcomes per reason, and the reasons whose accept
   * rate is high enough (min sample, low reject rate) to be promoted from a
   * prompt to auto-publish. Promotion is a deliberate change, never automatic.
   */
  readonly identity: {
    readonly rates: DecisionRate[];
    readonly autoPublishSuggestions: string[];
  };
}> {
  const now = options.now ?? new Date();
  const handleFilter =
    options.handles && options.handles.length > 0
      ? drizzleSql`AND lower(username) = ANY(${options.handles.map(h => h.toLowerCase())})`
      : drizzleSql``;
  const rows = await db.execute<{
    id: string;
    username: string;
    spotify_id: string | null;
  }>(drizzleSql`
    SELECT id, username, spotify_id FROM ${creatorProfiles}
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
  const rates = await getIdentityDecisionRates().catch(() => []);
  return {
    identity: {
      rates,
      autoPublishSuggestions: suggestAutoPublishReasons(rates, {
        minDecisions: 20,
        maxRejectRate: 0.05,
      }),
    },
    profiles,
    totals: {
      profiles: profiles.length,
      publicBefore: sum(r => r.publicBefore),
      publicAfter: sum(r => r.publicAfter),
      approvalsPublished: sum(r => r.approvalsPublished),
      queuedForReview: sum(r => r.queuedForReview),
      imported: sum(r => r.imported),
      failed: sum(r => r.importFailed),
    },
  };
}
