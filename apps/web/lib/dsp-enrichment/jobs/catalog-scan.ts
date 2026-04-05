import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { z } from 'zod';

import { type DbOrTransaction, db } from '@/lib/db';
import { discogRecordings } from '@/lib/db/schema/content';
import {
  dspCatalogMismatches,
  dspCatalogScans,
} from '@/lib/db/schema/dsp-catalog-scan';
import { captureError } from '@/lib/error-tracking';
import {
  getSpotifyAlbums,
  getSpotifyArtistAlbums,
  getSpotifyTracks,
} from '@/lib/spotify';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// Payload schema
// ============================================================================

export const catalogScanPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  spotifyArtistId: z.string(),
  scanId: z.string().uuid(),
});

export type CatalogScanPayload = z.infer<typeof catalogScanPayloadSchema>;

// ============================================================================
// Result type
// ============================================================================

export interface CatalogScanResult {
  scanId: string;
  status: 'completed' | 'failed';
  catalogIsrcCount: number;
  dspIsrcCount: number;
  matchedCount: number;
  unmatchedCount: number;
  missingCount: number;
  coveragePct: string;
  albumsScanned: number;
  tracksScanned: number;
  error?: string;
}

// ============================================================================
// ISRC normalization (uppercase, trimmed)
// ============================================================================

function normalizeIsrc(isrc: string): string {
  return isrc.trim().toUpperCase();
}

// ============================================================================
// Main scan processor
// ============================================================================

export async function processCatalogScan(
  tx: DbOrTransaction,
  payload: unknown
): Promise<CatalogScanResult> {
  const parsed = catalogScanPayloadSchema.parse(payload);
  const { creatorProfileId, spotifyArtistId, scanId } = parsed;

  // Mark scan as running
  await tx
    .update(dspCatalogScans)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(dspCatalogScans.id, scanId));

  try {
    // Step 1: Fetch all Spotify albums (excludes appears_on)
    const { albums, total: _total } = await getSpotifyArtistAlbums(
      spotifyArtistId,
      { includeGroups: ['album', 'single', 'compilation'] }
    );

    if (albums.length === 0) {
      return await failScan(
        tx,
        scanId,
        'No albums returned from Spotify. Retry later.',
        { catalogIsrcCount: 0 }
      );
    }

    // Step 2: Fetch full album details in batches of 20
    const albumIds = albums.map(a => a.id);
    const fullAlbums = await getSpotifyAlbums(albumIds);

    if (fullAlbums.length === 0) {
      return await failScan(
        tx,
        scanId,
        'No album details returned from Spotify. Retry later.',
        { catalogIsrcCount: 0 }
      );
    }

    // Step 3: Collect all track IDs from album track listings (deduplicated)
    const trackIdSet = new Set<string>();
    for (const album of fullAlbums) {
      if (album.tracks?.items) {
        for (const track of album.tracks.items) {
          trackIdSet.add(track.id);
        }
      }
    }
    const trackIds = [...trackIdSet];

    // Step 4: Fetch full track details with ISRCs in batches of 50
    const fullTracks = await getSpotifyTracks(trackIds);

    if (fullTracks.length === 0) {
      return await failScan(
        tx,
        scanId,
        'No track details returned from Spotify. Retry later.',
        { catalogIsrcCount: 0 }
      );
    }

    // Step 5: Build track-to-album lookup map (O(1) instead of O(n) find)
    const trackToAlbum = new Map<
      string,
      { name: string; id: string; artworkUrl: string | undefined }
    >();
    for (const album of fullAlbums) {
      if (album.tracks?.items) {
        for (const track of album.tracks.items) {
          trackToAlbum.set(track.id, {
            name: album.name,
            id: album.id,
            artworkUrl: album.images?.[0]?.url,
          });
        }
      }
    }

    // Step 6: Build Spotify ISRC set (normalized)
    const spotifyIsrcMap = new Map<
      string,
      {
        trackId: string;
        trackName: string;
        albumName: string;
        albumId: string;
        artworkUrl: string | undefined;
        artistNames: string;
      }
    >();

    for (const track of fullTracks) {
      const isrc = track.external_ids?.isrc;
      if (!isrc) continue;

      const normalized = normalizeIsrc(isrc);
      if (spotifyIsrcMap.has(normalized)) continue; // dedupe

      const album = trackToAlbum.get(track.id);

      spotifyIsrcMap.set(normalized, {
        trackId: track.id,
        trackName: track.name,
        albumName: album?.name ?? 'Unknown Album',
        albumId: album?.id ?? '',
        artworkUrl: album?.artworkUrl,
        artistNames: track.artists?.map(a => a.name).join(', ') ?? '',
      });
    }

    // Step 6: Query local catalog ISRCs
    const localRecordings = await tx
      .select({ isrc: discogRecordings.isrc })
      .from(discogRecordings)
      .where(
        and(
          eq(discogRecordings.creatorProfileId, creatorProfileId),
          drizzleSql`${discogRecordings.isrc} IS NOT NULL`
        )
      );

    const localIsrcs = new Set(
      localRecordings
        .map(r => r.isrc)
        .filter((isrc): isrc is string => isrc !== null)
        .map(normalizeIsrc)
    );

    const spotifyIsrcs = new Set(spotifyIsrcMap.keys());

    // Step 7: Compute sets
    const matched = new Set(
      [...localIsrcs].filter(isrc => spotifyIsrcs.has(isrc))
    );
    const notInCatalog = new Set(
      [...spotifyIsrcs].filter(isrc => !localIsrcs.has(isrc))
    );
    const missingFromDsp = new Set(
      [...localIsrcs].filter(isrc => !spotifyIsrcs.has(isrc))
    );

    const coveragePct =
      localIsrcs.size > 0
        ? ((matched.size / localIsrcs.size) * 100).toFixed(2)
        : '0.00';

    // Step 8: Bulk-insert mismatches
    const mismatchRows: Array<{
      scanId: string;
      creatorProfileId: string;
      isrc: string;
      mismatchType: 'not_in_catalog' | 'missing_from_dsp';
      externalTrackId: string | null;
      externalTrackName: string | null;
      externalAlbumName: string | null;
      externalAlbumId: string | null;
      externalArtworkUrl: string | null;
      externalArtistNames: string | null;
      dedupKey: string;
    }> = [];

    for (const isrc of notInCatalog) {
      const info = spotifyIsrcMap.get(isrc);
      mismatchRows.push({
        scanId,
        creatorProfileId,
        isrc,
        mismatchType: 'not_in_catalog',
        externalTrackId: info?.trackId ?? null,
        externalTrackName: info?.trackName ?? null,
        externalAlbumName: info?.albumName ?? null,
        externalAlbumId: info?.albumId ?? null,
        externalArtworkUrl: info?.artworkUrl ?? null,
        externalArtistNames: info?.artistNames ?? null,
        dedupKey: `${creatorProfileId}:${isrc}:spotify`,
      });
    }

    for (const isrc of missingFromDsp) {
      mismatchRows.push({
        scanId,
        creatorProfileId,
        isrc,
        mismatchType: 'missing_from_dsp',
        externalTrackId: null,
        externalTrackName: null,
        externalAlbumName: null,
        externalAlbumId: null,
        externalArtworkUrl: null,
        externalArtistNames: null,
        dedupKey: `${creatorProfileId}:${isrc}:spotify`,
      });
    }

    if (mismatchRows.length > 0) {
      // Insert in batches of 100 to avoid query size limits
      const BATCH_SIZE = 100;
      for (let i = 0; i < mismatchRows.length; i += BATCH_SIZE) {
        const batch = mismatchRows.slice(i, i + BATCH_SIZE);
        await tx
          .insert(dspCatalogMismatches)
          .values(batch)
          .onConflictDoUpdate({
            target: [dspCatalogMismatches.dedupKey],
            set: {
              scanId: drizzleSql`EXCLUDED.scan_id`,
              externalTrackId: drizzleSql`EXCLUDED.external_track_id`,
              externalTrackName: drizzleSql`EXCLUDED.external_track_name`,
              externalAlbumName: drizzleSql`EXCLUDED.external_album_name`,
              externalAlbumId: drizzleSql`EXCLUDED.external_album_id`,
              externalArtworkUrl: drizzleSql`EXCLUDED.external_artwork_url`,
              externalArtistNames: drizzleSql`EXCLUDED.external_artist_names`,
              mismatchType: drizzleSql`EXCLUDED.mismatch_type`,
              updatedAt: new Date(),
              // Preserve existing status (don't overwrite dismissed items)
            },
          });
      }
    }

    // Step 9: Update scan with summary
    const result: CatalogScanResult = {
      scanId,
      status: 'completed',
      catalogIsrcCount: localIsrcs.size,
      dspIsrcCount: spotifyIsrcs.size,
      matchedCount: matched.size,
      unmatchedCount: notInCatalog.size,
      missingCount: missingFromDsp.size,
      coveragePct,
      albumsScanned: fullAlbums.length,
      tracksScanned: fullTracks.length,
    };

    await tx
      .update(dspCatalogScans)
      .set({
        status: 'completed',
        catalogIsrcCount: result.catalogIsrcCount,
        dspIsrcCount: result.dspIsrcCount,
        matchedCount: result.matchedCount,
        unmatchedCount: result.unmatchedCount,
        missingCount: result.missingCount,
        coveragePct: result.coveragePct,
        albumsScanned: result.albumsScanned,
        tracksScanned: result.tracksScanned,
        completedAt: new Date(),
      })
      .where(eq(dspCatalogScans.id, scanId));

    logger.info('[catalog-scan] Scan completed', {
      scanId,
      creatorProfileId,
      matched: matched.size,
      notInCatalog: notInCatalog.size,
      missingFromDsp: missingFromDsp.size,
      coveragePct,
    });

    return result;
  } catch (error) {
    await captureError('Catalog scan failed', error, {
      scanId,
      creatorProfileId,
      spotifyArtistId,
      operation: 'processCatalogScan',
    });

    return await failScan(tx, scanId, String(error), {
      catalogIsrcCount: 0,
    });
  }
}

/**
 * Standalone processor (uses default db connection)
 */
export async function processCatalogScanStandalone(
  payload: unknown
): Promise<CatalogScanResult> {
  return processCatalogScan(db, payload);
}

// ============================================================================
// Stale-running recovery
// ============================================================================

const STALE_SCAN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a scan is stale (stuck in running for > 5 minutes) and auto-fail it.
 * Called on every status poll.
 */
export async function recoverStaleScan(
  tx: DbOrTransaction,
  scanId: string
): Promise<boolean> {
  const [scan] = await tx
    .select({
      status: dspCatalogScans.status,
      startedAt: dspCatalogScans.startedAt,
    })
    .from(dspCatalogScans)
    .where(eq(dspCatalogScans.id, scanId))
    .limit(1);

  if (
    scan?.status === 'running' &&
    scan.startedAt &&
    Date.now() - scan.startedAt.getTime() > STALE_SCAN_TIMEOUT_MS
  ) {
    await tx
      .update(dspCatalogScans)
      .set({
        status: 'failed',
        error: 'Scan timed out after 5 minutes',
        completedAt: new Date(),
      })
      .where(eq(dspCatalogScans.id, scanId));
    return true;
  }

  return false;
}

// ============================================================================
// Helpers
// ============================================================================

async function failScan(
  tx: DbOrTransaction,
  scanId: string,
  error: string,
  partial: { catalogIsrcCount: number }
): Promise<CatalogScanResult> {
  await tx
    .update(dspCatalogScans)
    .set({
      status: 'failed',
      error,
      completedAt: new Date(),
    })
    .where(eq(dspCatalogScans.id, scanId));

  return {
    scanId,
    status: 'failed',
    catalogIsrcCount: partial.catalogIsrcCount,
    dspIsrcCount: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    missingCount: 0,
    coveragePct: '0.00',
    albumsScanned: 0,
    tracksScanned: 0,
    error,
  };
}
