import 'server-only';

import { and, desc, sql as drizzleSql, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { publicReleaseEligibilitySqlPredicate } from '@/lib/profile/public-release-eligibility';
import { logger } from '@/lib/utils/logger';
import { readProfileAccentTheme } from './profile-theme';
import { buildThemeWithProfileAccent } from './profile-theme.server';

/**
 * JOV-14241: derive the public profile stage accent from the newest release
 * cover at catalog sync time. Idempotent when `theme.profileAccent.sourceUrl`
 * already matches the newest artwork URL.
 */
/** Best-effort wrapper for catalog import paths that must not fail the sync. */
export async function syncProfileCoverAccentThemeBestEffort(
  creatorProfileId: string,
  context: string
): Promise<void> {
  try {
    await syncProfileCoverAccentTheme(creatorProfileId);
  } catch (error) {
    logger.warn('Cover accent sync failed', {
      context,
      creatorProfileId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function syncProfileCoverAccentTheme(
  creatorProfileId: string
): Promise<{ readonly updated: boolean; readonly sourceUrl: string | null }> {
  const [newest] = await db
    .select({
      artworkUrl: discogReleases.artworkUrl,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        isNotNull(discogReleases.artworkUrl),
        drizzleSql`${discogReleases.artworkUrl} <> ''`,
        publicReleaseEligibilitySqlPredicate()
      )
    )
    .orderBy(
      drizzleSql`${discogReleases.releaseDate} DESC NULLS LAST`,
      desc(discogReleases.id)
    )
    .limit(1);

  const artworkUrl =
    typeof newest?.artworkUrl === 'string' &&
    newest.artworkUrl.trim().length > 0
      ? newest.artworkUrl.trim()
      : null;

  if (!artworkUrl) {
    return { updated: false, sourceUrl: null };
  }

  const [profile] = await db
    .select({ theme: creatorProfiles.theme })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (!profile) {
    return { updated: false, sourceUrl: artworkUrl };
  }

  const existingAccent = readProfileAccentTheme(profile.theme);
  if (existingAccent?.sourceUrl === artworkUrl) {
    return { updated: false, sourceUrl: artworkUrl };
  }

  try {
    const theme = await buildThemeWithProfileAccent({
      existingTheme: profile.theme,
      sourceUrl: artworkUrl,
    });

    await db
      .update(creatorProfiles)
      .set({
        theme,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, creatorProfileId));

    return { updated: true, sourceUrl: artworkUrl };
  } catch (error) {
    logger.warn('Cover accent sync failed', {
      creatorProfileId,
      artworkUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return { updated: false, sourceUrl: artworkUrl };
  }
}
