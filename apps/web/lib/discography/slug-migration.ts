import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { publicReleaseEligibilitySqlPredicate } from '@/lib/profile/public-release-eligibility';
import {
  NUMERIC_SUFFIX,
  planSlugs,
  type SlugAssignment,
  type SlugItem,
  type SlugQualifier,
} from './slug-policy';

/**
 * Slug migration: rename existing releases to the plain-language policy.
 * Dry-run by default (counts per qualifier type); applying renames writes a
 * `content_slug_redirects` row for every old slug so each `-N` URL keeps
 * working through the public route's permanentRedirect (308).
 * Release slugs only; track slugs are a follow-up.
 */

export interface PlannedRename {
  readonly releaseId: string;
  readonly from: string;
  readonly to: string;
  readonly qualifier: SlugQualifier;
}

export interface MigrationItem extends SlugItem {
  readonly id: string;
  /**
   * Established canonical URL: the release is publicly live now and its slug
   * is not a bug-made numeric suffix. Established URLs are never renamed and
   * never displaced; only never-public or numeric-suffix slugs are migrated.
   */
  readonly established: boolean;
}

/** Established = publicly live and not a numeric-suffix (bug-made) slug. */
export function isEstablishedSlug(
  slug: string,
  publiclyLive: boolean
): boolean {
  return publiclyLive && !NUMERIC_SUFFIX.test(slug);
}

/** Renames needed to reach the policy slugs; unchanged items are omitted. */
export function buildRenamePlan(
  items: readonly MigrationItem[],
  reserved: ReadonlySet<string> = new Set()
): PlannedRename[] {
  const pinned = new Set(items.filter(i => i.established).map(i => i.key));
  const plan = planSlugs(items, reserved, pinned);
  const renames: PlannedRename[] = [];
  for (const item of items) {
    const next: SlugAssignment | undefined = plan.get(item.key);
    if (next && next.slug !== item.currentSlug) {
      renames.push({
        releaseId: item.id,
        from: item.currentSlug,
        to: next.slug,
        qualifier: next.qualifier,
      });
    }
  }
  return renames;
}

/**
 * Order renames so a target is never occupied when applied; renames stuck in a
 * cycle (a swap) are returned as `blocked` and reported, never forced.
 */
export function orderRenames(
  renames: readonly PlannedRename[],
  currentSlugs: ReadonlySet<string>
): { ordered: PlannedRename[]; blocked: PlannedRename[] } {
  const occupied = new Set(currentSlugs);
  const pending = [...renames];
  const ordered: PlannedRename[] = [];
  let progress = true;
  while (pending.length > 0 && progress) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const r = pending[i];
      if (!occupied.has(r.to)) {
        occupied.delete(r.from);
        occupied.add(r.to);
        ordered.push(r);
        pending.splice(i, 1);
        i--;
        progress = true;
      }
    }
  }
  return { ordered, blocked: pending };
}

export function countByQualifier(
  renames: readonly PlannedRename[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of renames) counts[r.qualifier] = (counts[r.qualifier] ?? 0) + 1;
  return counts;
}

export interface SlugMigrationProfileReport {
  readonly handle: string;
  readonly applied: boolean;
  readonly renames: readonly PlannedRename[];
  readonly blocked: readonly PlannedRename[];
  readonly counts: Record<string, number>;
}

async function loadItems(profile: {
  id: string;
  spotifyId: string | null;
}): Promise<{ items: MigrationItem[]; reserved: Set<string> }> {
  const rows = await db.execute<{
    id: string;
    title: string;
    slug: string;
    release_date: Date | null;
    popularity: number | null;
    artists: Array<{ id?: string; name?: string }> | null;
  }>(drizzleSql`
    SELECT id, title, slug, release_date, spotify_popularity AS popularity,
      metadata -> 'spotifyArtists' AS artists
    FROM discog_releases
    WHERE creator_profile_id = ${profile.id} AND deleted_at IS NULL
  `);
  const live = await db
    .select({ id: discogReleases.id })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, profile.id),
        publicReleaseEligibilitySqlPredicate()
      )
    );
  const liveIds = new Set(live.map(r => r.id));
  const items: MigrationItem[] = rows.rows.map(r => ({
    id: r.id,
    established: isEstablishedSlug(r.slug, liveIds.has(r.id)),
    key: r.id,
    kind: 'release',
    title: r.title,
    currentSlug: r.slug,
    releaseDate: r.release_date ? new Date(r.release_date) : null,
    popularity: r.popularity ?? 0,
    coPrimary: (r.artists ?? [])
      .filter(a => a.id && a.id !== profile.spotifyId && a.name)
      .map(a => String(a.name)),
    featured: [],
    remixers: [],
  }));

  // Reserved: recording/track slugs (shared namespace) and redirects that
  // point at other content or at a release outside this plan.
  const held = await db.execute<{ slug: string }>(drizzleSql`
    SELECT slug FROM discog_recordings WHERE creator_profile_id = ${profile.id}
    UNION SELECT slug FROM discog_tracks WHERE creator_profile_id = ${profile.id}
    UNION SELECT old_slug FROM content_slug_redirects
      WHERE creator_profile_id = ${profile.id}
        AND (release_id IS NULL OR release_id NOT IN (
          SELECT id FROM discog_releases WHERE creator_profile_id = ${profile.id}))
  `);
  return { items, reserved: new Set(held.rows.map(r => r.slug)) };
}

async function applyRename(profileId: string, r: PlannedRename): Promise<void> {
  // Reclaim a stale redirect of our own release, then redirect the old slug.
  await db.execute(drizzleSql`
    DELETE FROM content_slug_redirects
    WHERE creator_profile_id = ${profileId} AND old_slug = ${r.to}
      AND release_id = ${r.releaseId}`);
  await db.execute(drizzleSql`
    INSERT INTO content_slug_redirects
      (creator_profile_id, old_slug, content_type, release_id)
    VALUES (${profileId}, ${r.from}, 'release', ${r.releaseId})
    ON CONFLICT DO NOTHING`);
  await db.execute(drizzleSql`
    UPDATE discog_releases SET slug = ${r.to}, updated_at = now()
    WHERE id = ${r.releaseId} AND creator_profile_id = ${profileId}`);
}

export async function runSlugMigrationForProfile(
  profile: { id: string; username: string; spotifyId: string | null },
  apply: boolean
): Promise<SlugMigrationProfileReport> {
  const { items, reserved } = await loadItems(profile);
  const renames = buildRenamePlan(items, reserved);
  const { ordered, blocked } = orderRenames(
    renames,
    new Set(items.map(i => i.currentSlug))
  );
  if (apply) {
    for (const r of ordered) await applyRename(profile.id, r);
  }
  return {
    handle: profile.username,
    applied: apply,
    renames: ordered,
    blocked,
    counts: countByQualifier(ordered),
  };
}

/** Comma-separated handles or `*`; empty means nobody. */
function isListed(flag: string, handle: string): boolean {
  const value = flag.trim().toLowerCase();
  if (value === '*') return true;
  return value
    .split(',')
    .map(h => h.trim())
    .includes(handle.toLowerCase());
}

/** Handles allowed to apply (default none: dry-run only). */
export function mayApply(flag: string | undefined, handle: string): boolean {
  return (flag ?? '').trim() !== '' && isListed(flag ?? '', handle);
}

export async function runSlugMigration(options: {
  readonly budgetMs: number;
  readonly handles?: readonly string[];
  readonly applyFlag?: string;
}): Promise<{
  profiles: SlugMigrationProfileReport[];
  totals: {
    profiles: number;
    renames: number;
    byQualifier: Record<string, number>;
  };
}> {
  const handleFilter =
    options.handles && options.handles.length > 0
      ? drizzleSql`AND lower(username) = ANY(${options.handles.map(h => h.toLowerCase())})`
      : drizzleSql``;
  const rows = await db.execute<{
    id: string;
    username: string;
    spotify_id: string | null;
  }>(drizzleSql`
    SELECT id, username, spotify_id FROM creator_profiles
    WHERE is_claimed = true ${handleFilter}
    ORDER BY (settings -> 'slugMigration' ->> 'checkedAt') ASC NULLS FIRST, updated_at DESC
    LIMIT 50`);
  const profiles: SlugMigrationProfileReport[] = [];
  const started = Date.now();
  for (const p of rows.rows) {
    if (Date.now() - started > options.budgetMs) break;
    profiles.push(
      await runSlugMigrationForProfile(
        { id: p.id, username: p.username, spotifyId: p.spotify_id },
        mayApply(options.applyFlag, p.username)
      )
    );
    await db.execute(drizzleSql`
      UPDATE creator_profiles SET settings = jsonb_set(coalesce(settings, '{}'::jsonb),
        '{slugMigration}', ${JSON.stringify({ checkedAt: new Date().toISOString() })}::jsonb)
      WHERE id = ${p.id}`);
  }
  const byQualifier: Record<string, number> = {};
  let renames = 0;
  for (const r of profiles) {
    renames += r.renames.length;
    for (const [k, v] of Object.entries(r.counts))
      byQualifier[k] = (byQualifier[k] ?? 0) + v;
  }
  return {
    profiles,
    totals: { profiles: profiles.length, renames, byQualifier },
  };
}
