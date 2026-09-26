/**
 * Bounded identity enrichment for unclaimed artist profiles. JOV-6529
 *
 * Exact provider-ID-backed profiles created by structured-credit
 * reconciliation must carry more identity evidence than the single Spotify
 * link before they are treated as share-ready. This module:
 *
 *   1. resolves artist-controlled destinations from a trusted public
 *      identity source (MusicFetch artist lookup, keyed by the artist's
 *      exact Spotify URL — never by display-name similarity);
 *   2. stores every observed link in the identity layer with provenance,
 *      observed time, and raw payload (`artist_identity_links`);
 *   3. evaluates observations deterministically (dedupe by canonical
 *      identity, corroboration, conflict detection);
 *   4. publishes verified destinations through the canonical merge pipeline
 *      (confidence + dedupe + user-lock respect already live there);
 *   5. writes a share-readiness receipt to profile settings so Ovie can
 *      distinguish not_checked / not_found / conflicted / verified.
 *
 * The pass is idempotent: identity links upsert on
 * (profile, source, platform), the merge dedupes canonically, field updates
 * only fill nulls, and a terminal receipt short-circuits repeats unless
 * `force` is set. Claimed profiles are never touched.
 */

import 'server-only';

import { sql as drizzleSql, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { setEnrichmentJobStatus } from '@/lib/dsp-enrichment/enrichment-status';
import {
  extractAllMusicFetchServices,
  mapMusicFetchProfileFields,
} from '@/lib/dsp-enrichment/musicfetch-mapping';
import {
  fetchArtistBySpotifyUrl,
  isMusicFetchAvailable,
  type MusicFetchArtistResult,
} from '@/lib/dsp-enrichment/providers/musicfetch';
import { captureWarning } from '@/lib/error-tracking';
import { storeRawIdentityLinks } from '@/lib/identity/store';
import { normalizeAndMergeExtraction } from '@/lib/ingestion/merge';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import type { ExtractedLink } from '@/lib/ingestion/types';
import { logger } from '@/lib/utils/logger';
import {
  buildNotCheckedIdentityReceipt,
  buildUnclaimedIdentityEnrichmentReceipt,
  evaluateUnclaimedArtistIdentity,
  observationsFromMusicFetchArtist,
  readUnclaimedIdentityEnrichment,
  UNCLAIMED_IDENTITY_ENRICHMENT_KEY,
  type UnclaimedIdentityEnrichmentReceipt,
  type UnclaimedIdentityStatus,
} from './unclaimed-artist-identity';

// ============================================================================
// Lookup
// ============================================================================

/** Result of one bounded identity-source lookup for an unclaimed artist. */
export interface UnclaimedArtistIdentityLookup {
  /** Whether the lookup source was configured and the request was attempted. */
  readonly attempted: boolean;
  readonly artistData: MusicFetchArtistResult | null;
}

/**
 * Bounded identity lookup for one exact Spotify artist URL.
 *
 * `attempted` distinguishes "enrichment could not run" (source unavailable
 * or transient failure → receipt stays `not_checked`, safe to retry) from
 * "ran and found nothing" (→ `not_found`).
 */
export async function lookupUnclaimedArtistIdentity(
  spotifyUrl: string
): Promise<UnclaimedArtistIdentityLookup> {
  if (!isMusicFetchAvailable()) {
    return { attempted: false, artistData: null };
  }

  try {
    const artistData = await fetchArtistBySpotifyUrl(spotifyUrl);
    return { attempted: true, artistData };
  } catch (error) {
    logger.warn('Unclaimed artist identity lookup failed', {
      spotifyUrl,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { attempted: false, artistData: null };
  }
}

// ============================================================================
// Receipt persistence
// ============================================================================

async function writeIdentityEnrichmentReceipt(
  profileId: string,
  receipt: UnclaimedIdentityEnrichmentReceipt
): Promise<void> {
  await db.execute(drizzleSql`
    UPDATE ${creatorProfiles}
    SET
      settings = jsonb_set(
        COALESCE(settings, '{}'::jsonb),
        ${drizzleSql.raw(`'{${UNCLAIMED_IDENTITY_ENRICHMENT_KEY}}'`)},
        ${JSON.stringify(receipt)}::jsonb
      ),
      updated_at = NOW()
    WHERE id = ${profileId}
  `);
}

// ============================================================================
// Enrichment pass
// ============================================================================

export interface UnclaimedArtistEnrichmentInput {
  readonly profileId: string;
  readonly spotifyId: string;
  readonly spotifyUrl: string;
  /** Pre-fetched lookup result; omit to fetch lazily inside the pass. */
  readonly lookup?: UnclaimedArtistIdentityLookup;
  /** Re-run even when a terminal receipt already exists. */
  readonly force?: boolean;
}

const ENRICHMENT_SIGNALS = [
  'musicfetch_artist_lookup',
  'structured_spotify_release_credit',
] as const;

/**
 * Run the bounded identity-enrichment stage for one unclaimed profile.
 *
 * Safe to call repeatedly for backfill: claimed profiles return null, a
 * terminal receipt short-circuits (unless `force`), and all writes are
 * idempotent upserts/canonical dedupes. No claimed or user-locked field is
 * ever overwritten.
 */
export async function enrichUnclaimedArtistProfileIdentity(
  input: UnclaimedArtistEnrichmentInput
): Promise<UnclaimedIdentityStatus | null> {
  const { profileId, spotifyId, spotifyUrl } = input;

  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      isClaimed: creatorProfiles.isClaimed,
      settings: creatorProfiles.settings,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      displayNameLocked: creatorProfiles.displayNameLocked,
      avatarUrl: creatorProfiles.avatarUrl,
      avatarLockedByUser: creatorProfiles.avatarLockedByUser,
      bio: creatorProfiles.bio,
      spotifyUrl: creatorProfiles.spotifyUrl,
      spotifyId: creatorProfiles.spotifyId,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
      appleMusicId: creatorProfiles.appleMusicId,
      youtubeUrl: creatorProfiles.youtubeUrl,
      youtubeMusicId: creatorProfiles.youtubeMusicId,
      deezerId: creatorProfiles.deezerId,
      tidalId: creatorProfiles.tidalId,
      soundcloudId: creatorProfiles.soundcloudId,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  // Claimed profiles own their fields; enrichment never overwrites them.
  if (!profile || profile.isClaimed) return null;

  const existingReceipt = readUnclaimedIdentityEnrichment(profile.settings);
  if (
    existingReceipt &&
    !input.force &&
    existingReceipt.status !== 'not_checked'
  ) {
    return existingReceipt.status;
  }

  const lookup =
    input.lookup ?? (await lookupUnclaimedArtistIdentity(spotifyUrl));
  const observedAt = new Date().toISOString();

  if (!lookup.attempted) {
    const receipt: UnclaimedIdentityEnrichmentReceipt = {
      ...buildNotCheckedIdentityReceipt({
        providerArtistId: spotifyId,
        observedAt,
      }),
    };
    await writeReceiptSafely(profileId, receipt);
    return receipt.status;
  }

  if (!lookup.artistData) {
    const receipt: UnclaimedIdentityEnrichmentReceipt = {
      ...buildNotCheckedIdentityReceipt({
        providerArtistId: spotifyId,
        observedAt,
      }),
      status: 'not_found',
      sources: ['musicfetch'],
    };
    await writeReceiptSafely(profileId, receipt);
    await setEnrichmentJobStatus(db, profileId, 'musicfetch', 'complete').catch(
      () => undefined
    );
    return receipt.status;
  }

  const artistData = lookup.artistData;

  // Raw identity layer: provenance + observed time + raw payload for every
  // service the source returned. Additive — never aborts the pass.
  try {
    await storeRawIdentityLinks(
      db,
      profileId,
      'musicfetch',
      spotifyUrl,
      extractAllMusicFetchServices(artistData, spotifyUrl)
    );
  } catch (error) {
    logger.warn('Unclaimed artist enrichment: identity store failed', {
      profileId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  const evaluation = evaluateUnclaimedArtistIdentity(
    observationsFromMusicFetchArtist(artistData, spotifyUrl, observedAt)
  );

  // Publish only verified destinations through the canonical merge pipeline
  // (canonical dedupe, confidence scoring, lock respect live there).
  const publishable: ExtractedLink[] = evaluation.links
    .filter(link => link.status === 'verified')
    .map(link => ({
      url: link.url,
      sourcePlatform: 'musicfetch',
      evidence: {
        sources: [...link.sources],
        signals: [...ENRICHMENT_SIGNALS],
      },
    }));

  const dspUpdates = mapMusicFetchProfileFields(
    artistData,
    profile,
    spotifyUrl,
    spotifyId
  );
  if (profile.avatarLockedByUser) delete dspUpdates.avatarUrl;

  const receipt = buildUnclaimedIdentityEnrichmentReceipt(evaluation, {
    providerArtistId: spotifyId,
    observedAt,
  });

  await withSystemIngestionSession(async tx => {
    if (publishable.length > 0) {
      await normalizeAndMergeExtraction(
        tx,
        {
          id: profile.id,
          usernameNormalized: profile.usernameNormalized,
          avatarUrl: profile.avatarUrl,
          displayName: profile.displayName,
          avatarLockedByUser: profile.avatarLockedByUser,
          displayNameLocked: profile.displayNameLocked,
        },
        {
          links: publishable,
          sourcePlatform: 'musicfetch',
          sourceUrl: spotifyUrl,
        }
      );
    }

    if (Object.keys(dspUpdates).length > 0) {
      await tx
        .update(creatorProfiles)
        .set({ ...dspUpdates, updatedAt: new Date() })
        .where(eq(creatorProfiles.id, profileId));
    }
  });

  await writeReceiptSafely(profileId, receipt);
  await setEnrichmentJobStatus(db, profileId, 'musicfetch', 'complete').catch(
    () => undefined
  );

  logger.info('Unclaimed artist identity enrichment completed', {
    profileId,
    status: receipt.status,
    linksFound: receipt.linksFound,
    verifiedPlatforms: receipt.verifiedPlatforms,
    conflicts: receipt.conflicts.length,
    shareReady: receipt.shareReady,
  });

  return receipt.status;
}

async function writeReceiptSafely(
  profileId: string,
  receipt: UnclaimedIdentityEnrichmentReceipt
): Promise<void> {
  try {
    await writeIdentityEnrichmentReceipt(profileId, receipt);
  } catch (error) {
    await captureWarning(
      'Unclaimed artist identity receipt write failed',
      error,
      { source: 'unclaimed_artist_enrichment', profileId }
    );
  }
}

/** Build the `not_checked` receipt stored at profile creation time. */
export function buildInitialUnclaimedEnrichmentReceipt(params: {
  providerArtistId: string;
  observedAt: string;
}): UnclaimedIdentityEnrichmentReceipt {
  return buildNotCheckedIdentityReceipt(params);
}
