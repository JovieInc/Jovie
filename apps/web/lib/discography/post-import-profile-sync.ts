import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { syncProfileCoverAccentThemeBestEffort } from '@/lib/profile/sync-cover-accent.server';

/**
 * Aggregate genres across all releases for a creator profile and update
 * the profile's genres with the top 3 most frequent genres.
 * Also refreshes cover-lit stage accent (JOV-14241).
 */
export async function syncProfileGenresFromReleases(
  creatorProfileId: string
): Promise<void> {
  const releases = await db
    .select({ genres: discogReleases.genres })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        drizzleSql`${discogReleases.genres} IS NOT NULL`
      )
    );

  // Count frequency of each genre across all releases
  const genreCounts = new Map<string, number>();
  for (const release of releases) {
    if (!release.genres) continue;
    for (const genre of release.genres) {
      const normalized = genre.toLowerCase();
      genreCounts.set(normalized, (genreCounts.get(normalized) ?? 0) + 1);
    }
  }

  // Sort by frequency (desc), then alphabetically for deterministic tiebreak
  const topGenres = Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([genre]) => genre);

  // Don't overwrite existing genres if no release genres were found
  if (topGenres.length > 0) {
    await db
      .update(creatorProfiles)
      .set({ genres: topGenres, updatedAt: new Date() })
      .where(eq(creatorProfiles.id, creatorProfileId));
  }

  await syncProfileCoverAccentThemeBestEffort(
    creatorProfileId,
    'catalog_import'
  );
}

/** Alias for catalog import call sites that want the full post-import pass. */
export const syncProfileAfterCatalogImport = syncProfileGenresFromReleases;
