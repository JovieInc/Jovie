/**
 * Apple Music catalog completeness (JOV-7140).
 *
 * Spotify import never sees releases that exist only on Apple Music (older
 * label EPs, collabs credited elsewhere), and Apple enrichment only links URLs
 * onto releases already in the Library. This adds the missing ones for any
 * artist whose Apple Music identity is bound to the profile, and runs on a
 * bounded weekly rotation so gaps close without the artist doing anything.
 */

import 'server-only';

import { and, sql as drizzleSql, eq, gt, inArray } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { createPublicReleasesTag } from '@/lib/cache/tags';
import { type DbOrTransaction, db } from '@/lib/db';
import { discogReleases, providerLinks } from '@/lib/db/schema/content';
import { dspCatalogScans } from '@/lib/db/schema/dsp-catalog-scan';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getBoundAppleMusicArtistId } from '@/lib/dsp-enrichment/apple-music-target';
import {
  getArtistAlbums,
  isAppleMusicAvailable,
} from '@/lib/dsp-enrichment/providers/apple-music';
import { logger } from '@/lib/utils/logger';
import {
  type AppleCatalogAlbum,
  appleAlbumIdFromUrl,
  appleArtworkUrl,
  appleReleaseType,
  cleanAppleAlbumTitle,
  selectMissingAppleAlbums,
} from './apple-music-catalog';
import { upsertProviderLink, upsertRelease } from './queries';
import { generateUniqueSlug } from './slug';

const PROVIDER_ID = 'apple_music';
/** Scan key when Apple fields exist but no artist id is bound. */
const UNBOUND_ARTIST_ID = 'unbound';
/** Cap per profile per run; the next weekly run picks up the rest. */
const MAX_IMPORTS_PER_RUN = 25;
const ALBUM_FETCH_LIMIT = 100;
/** Weekly rotation, bounded so the shared daily-maintenance budget holds. */
const SWEEP_PROFILES_PER_RUN = 15;
const RECHECK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export interface AppleImportResult {
  creatorProfileId: string;
  status: 'imported' | 'up_to_date' | 'no_authority' | 'unavailable' | 'failed';
  albumsScanned: number;
  imported: string[];
  error?: string;
}

async function loadLibrary(dbConn: DbOrTransaction, creatorProfileId: string) {
  // Archived rows stay in the match set. Omitting them inserts a second,
  // active copy of a release the artist already removed.
  const releases = await dbConn
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      upc: discogReleases.upc,
    })
    .from(discogReleases)
    .where(eq(discogReleases.creatorProfileId, creatorProfileId));
  if (releases.length === 0) return [];

  const links = await dbConn
    .select({ releaseId: providerLinks.releaseId, url: providerLinks.url })
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.providerId, PROVIDER_ID),
        eq(providerLinks.ownerType, 'release'),
        inArray(
          providerLinks.releaseId,
          releases.map(r => r.id)
        )
      )
    );
  const idsByRelease = new Map<string, string[]>();
  for (const link of links) {
    const albumId = appleAlbumIdFromUrl(link.url);
    if (!link.releaseId || !albumId) continue;
    idsByRelease.set(link.releaseId, [
      ...(idsByRelease.get(link.releaseId) ?? []),
      albumId,
    ]);
  }
  return releases.map(r => ({
    title: r.title,
    upc: r.upc,
    appleAlbumIds: idsByRelease.get(r.id) ?? [],
  }));
}

async function insertAppleRelease(
  creatorProfileId: string,
  album: AppleCatalogAlbum
): Promise<void> {
  const title = cleanAppleAlbumTitle(album.attributes.name);
  const releaseDate = album.attributes.releaseDate
    ? new Date(`${album.attributes.releaseDate.slice(0, 10)}T00:00:00Z`)
    : null;
  const validDate =
    releaseDate && !Number.isNaN(releaseDate.getTime()) ? releaseDate : null;
  const slug = await generateUniqueSlug(
    creatorProfileId,
    title,
    'release',
    undefined,
    { year: validDate?.getUTCFullYear() ?? null, releaseDate: validDate }
  );
  const release = await upsertRelease({
    creatorProfileId,
    title,
    slug,
    releaseType: appleReleaseType(album),
    releaseDate: validDate,
    label: album.attributes.recordLabel ?? null,
    upc: album.attributes.upc ?? null,
    totalTracks: album.attributes.trackCount ?? 0,
    isExplicit: album.attributes.contentRating === 'explicit',
    artworkUrl: appleArtworkUrl(album.attributes.artwork),
    sourceType: 'ingested',
    metadata: {
      appleMusicAlbumId: album.id,
      appleMusicArtistName: album.attributes.artistName,
      importedFrom: PROVIDER_ID,
      importedAt: new Date().toISOString(),
    },
  });
  await upsertProviderLink({
    releaseId: release.id,
    providerId: PROVIDER_ID,
    url: album.attributes.url,
    // Shared collab albums are linked on several profiles; keep the ID in
    // metadata so the global (provider, external_id) index never collides.
    externalId: null,
    sourceType: 'ingested',
    isPrimary: false,
    metadata: { providerExternalId: album.id },
  });
}

async function recordRun(
  creatorProfileId: string,
  externalArtistId: string,
  result: AppleImportResult
) {
  const settled =
    result.status === 'imported' || result.status === 'up_to_date';
  try {
    await db.insert(dspCatalogScans).values({
      creatorProfileId,
      providerId: PROVIDER_ID,
      externalArtistId,
      // `failed` keeps a no-authority row out of catalog-evidence reads, which
      // treat only `completed` scans as proof the profile has a catalog.
      status: settled ? 'completed' : 'failed',
      albumsScanned: result.albumsScanned,
      missingCount: result.imported.length,
      error:
        result.status === 'no_authority'
          ? 'no_authority'
          : (result.error ?? null),
      startedAt: new Date(),
      completedAt: new Date(),
    });
  } catch (error) {
    logger.warn('Apple Music import run not recorded', {
      creatorProfileId,
      error,
    });
  }
}

/** Add Apple Music releases the profile's Library is missing. */
export async function importMissingAppleMusicReleases(
  creatorProfileId: string,
  dbConn: DbOrTransaction = db
): Promise<AppleImportResult> {
  const base = { creatorProfileId, albumsScanned: 0, imported: [] as string[] };
  if (!isAppleMusicAvailable()) return { ...base, status: 'unavailable' };

  const artistId = await getBoundAppleMusicArtistId(dbConn, creatorProfileId);
  if (!artistId) {
    const result: AppleImportResult = { ...base, status: 'no_authority' };
    // A profile with Apple fields but no bound artist must still leave a scan
    // row. The weekly batch is a fixed 15, ordered by id, and skips only
    // profiles scanned in the last week. Returning here without a row picks
    // the same profiles forever and starves the rest.
    await recordRun(creatorProfileId, UNBOUND_ARTIST_ID, result);
    return result;
  }

  let result: AppleImportResult;
  try {
    const albums = (await getArtistAlbums(
      artistId,
      {},
      ALBUM_FETCH_LIMIT
    )) as AppleCatalogAlbum[];
    const library = await loadLibrary(dbConn, creatorProfileId);
    const missing = selectMissingAppleAlbums(albums, library).slice(
      0,
      MAX_IMPORTS_PER_RUN
    );
    for (const album of missing) {
      await insertAppleRelease(creatorProfileId, album);
      base.imported.push(cleanAppleAlbumTitle(album.attributes.name));
    }
    result = {
      ...base,
      albumsScanned: albums.length,
      status: base.imported.length > 0 ? 'imported' : 'up_to_date',
    };
    if (base.imported.length > 0) {
      try {
        revalidateTag(createPublicReleasesTag(creatorProfileId), 'max');
      } catch {
        // Outside a request scope (scripts/tests); TTL refresh covers it.
      }
    }
  } catch (error) {
    result = {
      ...base,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  await recordRun(creatorProfileId, artistId, result);
  logger.info('Apple Music catalog completeness', {
    creatorProfileId,
    status: result.status,
    albumsScanned: result.albumsScanned,
    imported: result.imported.length,
  });
  return result;
}

/** Claimed profiles with an Apple Music ID not checked in the last week. */
export async function findProfilesDueForAppleImport(
  limit = SWEEP_PROFILES_PER_RUN,
  now = new Date()
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - RECHECK_AFTER_MS);
  const recent = db
    .select({ id: dspCatalogScans.creatorProfileId })
    .from(dspCatalogScans)
    .where(
      and(
        eq(dspCatalogScans.providerId, PROVIDER_ID),
        gt(dspCatalogScans.createdAt, cutoff)
      )
    );
  const rows = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.isClaimed, true),
        drizzleSql`(${creatorProfiles.appleMusicId} IS NOT NULL OR ${creatorProfiles.appleMusicUrl} IS NOT NULL)`,
        drizzleSql`${creatorProfiles.id} NOT IN (${recent})`
      )
    )
    .orderBy(creatorProfiles.id)
    .limit(limit);
  return rows.map(r => r.id);
}

export async function sweepAppleMusicCatalogCompletenessForCron(): Promise<{
  profilesChecked: number;
  releasesImported: number;
  failed: number;
}> {
  if (!isAppleMusicAvailable())
    return { profilesChecked: 0, releasesImported: 0, failed: 0 };
  const profileIds = await findProfilesDueForAppleImport();
  let releasesImported = 0;
  let failed = 0;
  for (const id of profileIds) {
    const result = await importMissingAppleMusicReleases(id);
    releasesImported += result.imported.length;
    if (result.status === 'failed') failed += 1;
  }
  return { profilesChecked: profileIds.length, releasesImported, failed };
}
