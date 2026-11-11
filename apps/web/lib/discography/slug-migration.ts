/**
 * Legacy numeric slug migration: persistence.
 *
 * Renames bug-made `-N` release and track slugs to plain-language slugs for
 * every artist (the follow-up promised in #23143), keeping each old release
 * URL working through `content_slug_redirects` (the release route already
 * 308s old slugs) and each old track URL through the track route's numeric
 * fallback. Planning is pure and lives in slug-migration-plan.ts.
 */

import 'server-only';

import { and, sql as drizzleSql, eq, isNotNull, isNull } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import {
  CACHE_TAGS,
  createPublicReleasesTag,
  createSmartLinkContentTag,
} from '@/lib/cache/tags';
import { db } from '@/lib/db';
import {
  artists,
  contentSlugRedirects,
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  discogTracks,
  releaseArtists,
} from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { renameReleaseSlug } from '@/lib/domain/releases';
import { logger } from '@/lib/utils/logger';
import {
  planLegacyReleaseSlugRenames,
  planLegacyTrackSlugRenames,
  type SlugRename,
} from './slug-migration-plan';
import type { SlugItem } from './slug-policy';

type Db = typeof db;

/** Profiles migrated per cron run; each is a handful of small queries. */
export const LEGACY_SLUG_PROFILES_PER_RUN = 25;

/**
 * Cheap SQL prefilter: a slug ending in `-N` whose title does not itself end
 * in a digit. The exact check (slug = title slug + `-N`) is in the planner.
 */
const legacyReleaseSlugSql = drizzleSql`${discogReleases.slug} ~ '-[0-9]{1,3}$' AND ${discogReleases.title} !~ '[0-9][[:space:]]*$'`;
const legacyTrackSlugSql = drizzleSql`${discogReleaseTracks.slug} ~ '-[0-9]{1,3}$' AND ${discogReleaseTracks.title} !~ '[0-9][[:space:]]*$'`;

export interface LegacySlugMigrationResult {
  readonly profileId: string;
  readonly releasesRenamed: number;
  readonly tracksRenamed: number;
  readonly skipped: number;
}

async function loadReleaseItems(
  profileId: string,
  conn: Db
): Promise<SlugItem[]> {
  const [rows, credits] = await Promise.all([
    conn
      .select({
        id: discogReleases.id,
        title: discogReleases.title,
        slug: discogReleases.slug,
        releaseDate: discogReleases.releaseDate,
        popularity: discogReleases.spotifyPopularity,
      })
      .from(discogReleases)
      .where(
        and(
          eq(discogReleases.creatorProfileId, profileId),
          isNull(discogReleases.deletedAt)
        )
      ),
    conn
      .select({ releaseId: releaseArtists.releaseId, name: artists.name })
      .from(releaseArtists)
      .innerJoin(artists, eq(artists.id, releaseArtists.artistId))
      .innerJoin(
        discogReleases,
        eq(discogReleases.id, releaseArtists.releaseId)
      )
      .where(
        and(
          eq(discogReleases.creatorProfileId, profileId),
          eq(releaseArtists.role, 'main_artist'),
          drizzleSql`${artists.creatorProfileId} IS DISTINCT FROM ${profileId}`
        )
      ),
  ]);

  const coPrimary = new Map<string, string[]>();
  for (const credit of credits) {
    coPrimary.set(credit.releaseId, [
      ...(coPrimary.get(credit.releaseId) ?? []),
      credit.name,
    ]);
  }

  return rows.map(row => ({
    key: row.id,
    kind: 'release' as const,
    title: row.title,
    currentSlug: row.slug,
    releaseDate: row.releaseDate,
    coPrimary: coPrimary.get(row.id) ?? [],
    featured: [],
    remixers: [],
    versionType: null,
    popularity: row.popularity ?? 0,
  }));
}

/** Slugs a release rename must never take: anything outside the plan. */
async function loadReservedSlugs(
  profileId: string,
  conn: Db
): Promise<Set<string>> {
  const [deleted, recordings, legacyTracks, redirects] = await Promise.all([
    conn
      .select({ slug: discogReleases.slug })
      .from(discogReleases)
      .where(
        and(
          eq(discogReleases.creatorProfileId, profileId),
          isNotNull(discogReleases.deletedAt)
        )
      ),
    conn
      .select({ slug: discogRecordings.slug })
      .from(discogRecordings)
      .where(eq(discogRecordings.creatorProfileId, profileId)),
    conn
      .select({ slug: discogTracks.slug })
      .from(discogTracks)
      .where(eq(discogTracks.creatorProfileId, profileId)),
    conn
      .select({ slug: contentSlugRedirects.oldSlug })
      .from(contentSlugRedirects)
      .where(eq(contentSlugRedirects.creatorProfileId, profileId)),
  ]);
  return new Set(
    [...deleted, ...recordings, ...legacyTracks, ...redirects].map(r => r.slug)
  );
}

async function applyTrackRename(
  rename: SlugRename,
  conn: Db
): Promise<boolean> {
  const updated = await conn
    .update(discogReleaseTracks)
    .set({ slug: rename.to, updatedAt: new Date() })
    .where(
      and(
        eq(discogReleaseTracks.id, rename.id),
        eq(discogReleaseTracks.slug, rename.from)
      )
    )
    .returning({ id: discogReleaseTracks.id });
  return updated.length > 0;
}

// The dashboard release matrix expires on its own TTL; old slugs it still
// shows keep resolving through the redirects above.
function invalidate(profileId: string): void {
  revalidateTag(createSmartLinkContentTag(profileId), 'max');
  revalidateTag(createPublicReleasesTag(profileId), 'max');
  revalidateTag(CACHE_TAGS.PUBLIC_PROFILE, 'max');
  revalidateTag(CACHE_TAGS.SITEMAP_CATALOG, 'max');
}

/** Rename one artist's legacy `-N` release and track slugs. Idempotent. */
export async function migrateLegacySlugsForProfile(
  profileId: string,
  conn: Db = db
): Promise<LegacySlugMigrationResult> {
  const [items, reserved, tracks] = await Promise.all([
    loadReleaseItems(profileId, conn),
    loadReservedSlugs(profileId, conn),
    conn
      .select({
        id: discogReleaseTracks.id,
        releaseId: discogReleaseTracks.releaseId,
        title: discogReleaseTracks.title,
        slug: discogReleaseTracks.slug,
      })
      .from(discogReleaseTracks)
      .innerJoin(
        discogReleases,
        eq(discogReleases.id, discogReleaseTracks.releaseId)
      )
      .where(
        and(
          eq(discogReleases.creatorProfileId, profileId),
          isNull(discogReleases.deletedAt)
        )
      ),
  ]);

  let releasesRenamed = 0;
  let tracksRenamed = 0;
  let skipped = 0;

  for (const rename of planLegacyReleaseSlugRenames(items, reserved)) {
    try {
      if (
        await renameReleaseSlug(
          { profileId, releaseId: rename.id, from: rename.from, to: rename.to },
          conn
        )
      )
        releasesRenamed++;
      else skipped++;
    } catch (error) {
      // A concurrent writer took the slug; the next run replans around it.
      skipped++;
      logger.warn('Legacy release slug rename skipped', {
        profileId,
        releaseId: rename.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const rename of planLegacyTrackSlugRenames(tracks)) {
    try {
      if (await applyTrackRename(rename, conn)) tracksRenamed++;
      else skipped++;
    } catch (error) {
      skipped++;
      logger.warn('Legacy track slug rename skipped', {
        profileId,
        releaseTrackId: rename.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (releasesRenamed + tracksRenamed > 0) invalidate(profileId);
  return { profileId, releasesRenamed, tracksRenamed, skipped };
}

/**
 * Profiles that still have candidate legacy slugs. Random order, so a profile
 * whose remaining `-N` slugs cannot be renamed never starves the others.
 */
export async function findProfilesWithLegacySlugs(
  limit = LEGACY_SLUG_PROFILES_PER_RUN,
  conn: Db = db
): Promise<string[]> {
  const [withReleases, withTracks] = await Promise.all([
    conn
      .select({ id: creatorProfiles.id })
      .from(discogReleases)
      .innerJoin(
        creatorProfiles,
        eq(creatorProfiles.id, discogReleases.creatorProfileId)
      )
      .where(and(isNull(discogReleases.deletedAt), legacyReleaseSlugSql))
      .groupBy(creatorProfiles.id)
      .orderBy(drizzleSql`random()`)
      .limit(limit),
    conn
      .select({ id: creatorProfiles.id })
      .from(discogReleaseTracks)
      .innerJoin(
        discogReleases,
        eq(discogReleases.id, discogReleaseTracks.releaseId)
      )
      .innerJoin(
        creatorProfiles,
        eq(creatorProfiles.id, discogReleases.creatorProfileId)
      )
      .where(and(isNull(discogReleases.deletedAt), legacyTrackSlugSql))
      .groupBy(creatorProfiles.id)
      .orderBy(drizzleSql`random()`)
      .limit(limit),
  ]);
  const ids = new Set([...withReleases, ...withTracks].map(row => row.id));
  return [...ids].slice(0, limit);
}

/** Daily sweep: migrate a bounded batch of artists. */
export async function sweepLegacySlugsForCron(conn: Db = db): Promise<{
  profilesChecked: number;
  releasesRenamed: number;
  tracksRenamed: number;
  failed: number;
}> {
  const profiles = await findProfilesWithLegacySlugs(
    LEGACY_SLUG_PROFILES_PER_RUN,
    conn
  );
  let releasesRenamed = 0;
  let tracksRenamed = 0;
  let failed = 0;
  for (const profileId of profiles) {
    try {
      const result = await migrateLegacySlugsForProfile(profileId, conn);
      releasesRenamed += result.releasesRenamed;
      tracksRenamed += result.tracksRenamed;
    } catch (error) {
      failed++;
      logger.error('Legacy slug migration failed', {
        profileId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    profilesChecked: profiles.length,
    releasesRenamed,
    tracksRenamed,
    failed,
  };
}
