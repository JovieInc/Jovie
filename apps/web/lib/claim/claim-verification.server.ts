import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { recordArtistOfferStage } from '@/lib/acquisition/artist-offer-funnel.server';
import { generateProofCode } from '@/lib/claim/proof-code';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { scheduleAfter } from '@/lib/next/schedule-after';
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

/**
 * Lazy: the review module pulls in Stripe, release import and the Ovie card
 * store, which the onboarding/dashboard callers of this module never need.
 */
async function fileClaimVerificationCard(
  input: Parameters<
    typeof import('./claim-verification-review.server').fileClaimVerificationCard
  >[0]
): Promise<void> {
  const review = await import('./claim-verification-review.server');
  await review.fileClaimVerificationCard(input);
}

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

/** The operator matches the support email to the request by this address. */
async function readRequesterEmail(profileId: string): Promise<string | null> {
  try {
    const [profile] = await db
      .select({ userId: creatorProfiles.userId })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);
    if (!profile?.userId) return null;
    const [owner] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, profile.userId))
      .limit(1);
    return owner?.email ?? null;
  } catch {
    // The card is still filed without it; the operator can look it up.
    return null;
  }
}

/**
 * File the operator review card for a self-serve private claim after the
 * response, so the claim request never waits on the card store. Filing is
 * idempotent per profile; never throws.
 */
export function scheduleClaimVerificationCard(input: {
  readonly profileId: string;
  readonly handle: string;
  readonly record: ClaimVerificationRecord;
}): void {
  if (input.record.status !== 'pending_verification') return;
  scheduleAfter(async () => {
    try {
      await fileClaimVerificationCard({
        ...input,
        requesterEmail: await readRequesterEmail(input.profileId),
      });
    } catch (error) {
      await captureError('Claim verification card filing failed', error, {
        action: 'scheduleClaimVerificationCard',
        creatorProfileId: input.profileId,
      });
    }
  });
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
  /** Admission proof request: open for review now, private page, no payment. */
  readonly proofOnly?: boolean;
  /** Consented journey id; records `pending-verification` when paid. */
  readonly acquisitionId?: string | null;
  readonly now?: Date;
}): Promise<ClaimVerificationRecord> {
  const now = input.now ?? new Date();
  const [row] = await db
    .select({
      settings: creatorProfiles.settings,
      handle: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, input.profileId))
    .limit(1);
  if (!row) throw new Error('Profile not found');

  const existing = readClaimVerification(row.settings);
  // A different artist never overwrites a request that is open or paid: that
  // would wipe a payment timestamp and its refund path.
  if (
    existing &&
    existing.spotifyArtistId !== input.spotifyArtistId &&
    (existing.paidAt !== null ||
      existing.status === 'pending_verification' ||
      existing.status === 'awaiting_payment')
  ) {
    return existing;
  }
  // A free admission for the same artist as an unpaid awaiting request becomes
  // proof-only: private until verified, open for review now.
  if (
    existing &&
    existing.spotifyArtistId === input.spotifyArtistId &&
    existing.status === 'awaiting_payment' &&
    input.proofOnly &&
    !existing.proofOnly
  ) {
    const merged: ClaimVerificationRecord = {
      ...existing,
      status: 'pending_verification',
      proofOnly: true,
      proofCode: generateProofCode(),
    };
    await db
      .update(creatorProfiles)
      .set({
        settings: withClaimVerification(row.settings, merged),
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, input.profileId));
    await fileClaimVerificationCard({
      profileId: input.profileId,
      handle: row.handle,
      record: merged,
      requesterEmail: await readRequesterEmail(input.profileId),
    });
    return merged;
  }
  if (existing && existing.spotifyArtistId === input.spotifyArtistId) {
    const paid = input.paid
      ? markClaimVerificationPaid(existing, now, input.acquisitionId)
      : null;
    if (!paid) {
      // A card that failed to file on the first pass must not leave an
      // invisible request: filing is idempotent, so retry it while pending.
      if (existing.status === 'pending_verification') {
        await fileClaimVerificationCard({
          profileId: input.profileId,
          handle: row.handle,
          record: existing,
          requesterEmail: await readRequesterEmail(input.profileId),
        });
      }
      return existing;
    }
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
    await fileClaimVerificationCard({
      profileId: input.profileId,
      handle: row.handle,
      record: paid,
    });
    return paid;
  }

  const record: ClaimVerificationRecord = {
    ...buildClaimVerificationRequest({
      spotifyArtistId: input.spotifyArtistId,
      artistName: input.artistName,
      reach: input.reach,
      paid: input.paid,
      proofOnly: input.proofOnly,
      proofCode: input.proofOnly ? generateProofCode() : undefined,
      now,
    }),
    acquisitionId: input.acquisitionId ?? null,
  };
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
    await fileClaimVerificationCard({
      profileId: input.profileId,
      handle: row.handle,
      record,
      requesterEmail: await readRequesterEmail(input.profileId),
    });
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
    .select({
      id: creatorProfiles.id,
      handle: creatorProfiles.usernameNormalized,
      settings: creatorProfiles.settings,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, input.appUserId));

  let transitioned = 0;
  for (const row of rows) {
    const current = readClaimVerification(row.settings);
    const next = markClaimVerificationPaid(
      current,
      input.paidAt,
      input.acquisitionId
    );
    if (next) {
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
    // File (or, on a webhook retry, replay) the review card in Tim's queue.
    const pending = next ?? current;
    if (pending?.status === 'pending_verification') {
      await fileClaimVerificationCard({
        profileId: row.id,
        handle: row.handle,
        record: pending,
      });
    }
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
