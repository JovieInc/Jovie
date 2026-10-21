import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { recordArtistOfferStage } from '@/lib/acquisition/artist-offer-funnel.server';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { isSpotifyAvailable, spotifyClient } from '@/lib/spotify';
import { logger } from '@/lib/utils/logger';
import {
  buildClaimVerificationRequest,
  type ClaimVerificationRecord,
  markClaimVerificationPaid,
  readClaimVerification,
  requiresClaimVerification,
  withClaimVerification,
} from './claim-verification';

export interface ArtistReach {
  /** Spotify followers; null when unknown. */
  readonly followers: number | null;
  readonly name: string | null;
}

/**
 * Current reach for a Spotify artist: a stored count on any Jovie profile for
 * that artist when present, otherwise one Spotify lookup. Returns
 * `followers: null` when neither source answers; callers decide whether that
 * fails closed.
 */
export async function lookupArtistReach(
  spotifyArtistId: string
): Promise<ArtistReach> {
  const [stored] = await db
    .select({
      followers: creatorProfiles.spotifyFollowers,
      name: creatorProfiles.displayName,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.spotifyId, spotifyArtistId))
    .orderBy(desc(creatorProfiles.spotifyFollowers))
    .limit(1);

  if (typeof stored?.followers === 'number') {
    return { followers: stored.followers, name: stored.name ?? null };
  }
  if (!isSpotifyAvailable()) {
    return { followers: null, name: stored?.name ?? null };
  }
  try {
    const artist = await spotifyClient.getArtist(spotifyArtistId);
    return {
      followers: artist.followerCount,
      name: stored?.name ?? artist.name ?? null,
    };
  } catch (error) {
    logger.warn('Claim reach lookup failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { followers: null, name: stored?.name ?? null };
  }
}

/**
 * Decide whether attaching this Spotify identity must wait for verification.
 * Returns the reach when it does, null when the self-serve flow may continue.
 */
export async function getClaimVerificationReach(
  spotifyArtistId: string
): Promise<number | null> {
  const { followers } = await lookupArtistReach(spotifyArtistId);
  return requiresClaimVerification(followers) ? followers : null;
}

/**
 * Store a verification request on the requester's own profile instead of
 * attaching the artist identity. Idempotent for the same artist: an existing
 * open or decided request keeps its timestamps.
 */
export async function requestClaimVerification(input: {
  readonly profileId: string;
  readonly spotifyArtistId: string;
  readonly artistName: string | null;
  readonly reach: number;
  readonly paid: boolean;
  /** Consented journey id; records `pending-verification` when paid. */
  readonly acquisitionId?: string | null;
  readonly now?: Date;
}): Promise<ClaimVerificationRecord> {
  const now = input.now ?? new Date();
  const [row] = await db
    .select({ settings: creatorProfiles.settings })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, input.profileId))
    .limit(1);
  if (!row) throw new Error('Profile not found');

  const existing = readClaimVerification(row.settings);
  if (existing && existing.spotifyArtistId === input.spotifyArtistId) {
    const paid = input.paid ? markClaimVerificationPaid(existing, now) : null;
    if (!paid) return existing;
    await db
      .update(creatorProfiles)
      .set({
        settings: withClaimVerification(row.settings, paid),
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, input.profileId));
    await recordArtistOfferStage(
      input.acquisitionId,
      'pending-verification',
      now
    );
    return paid;
  }

  const record = buildClaimVerificationRequest({
    spotifyArtistId: input.spotifyArtistId,
    artistName: input.artistName,
    reach: input.reach,
    paid: input.paid,
    now,
  });
  await db
    .update(creatorProfiles)
    .set({
      settings: withClaimVerification(row.settings, record),
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, input.profileId));
  if (record.status === 'pending_verification') {
    await recordArtistOfferStage(
      input.acquisitionId,
      'pending-verification',
      now
    );
  }
  return record;
}

/**
 * Stripe checkout webhook transition: every `awaiting_payment` request on the
 * paying user's profiles becomes `pending_verification`, and the funnel
 * records the `pending-verification` stage. Retries are no-ops.
 *
 * The status write is part of the paid outcome and throws on failure so
 * Stripe retries; the stage record is measurement only.
 */
export async function markClaimVerificationsPaid(input: {
  readonly appUserId: string;
  readonly paidAt: Date;
  readonly acquisitionId: string | null | undefined;
}): Promise<number> {
  const rows = await db
    .select({ id: creatorProfiles.id, settings: creatorProfiles.settings })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, input.appUserId));

  let transitioned = 0;
  for (const row of rows) {
    const next = markClaimVerificationPaid(
      readClaimVerification(row.settings),
      input.paidAt
    );
    if (!next) continue;
    await db
      .update(creatorProfiles)
      .set({
        settings: withClaimVerification(row.settings, next),
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, row.id));
    transitioned += 1;
    logger.info('Claim verification pending after payment', {
      profileId: row.id,
      spotifyArtistId: next.spotifyArtistId,
      reach: next.reach.value,
    });
  }

  if (transitioned > 0) {
    await recordArtistOfferStage(
      input.acquisitionId,
      'pending-verification',
      input.paidAt
    );
  }
  return transitioned;
}
