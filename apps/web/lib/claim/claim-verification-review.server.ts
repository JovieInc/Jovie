import 'server-only';

import { and, sql as drizzleSql, eq, ne } from 'drizzle-orm';
import { BASE_URL } from '@/constants/domains';
import { recordArtistOfferStage } from '@/lib/acquisition/artist-offer-funnel.server';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { type DbOrTransaction, db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { syncReleasesFromSpotify } from '@/lib/discography/spotify-import';
import { captureError } from '@/lib/error-tracking';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { summerCardId } from '@/lib/ovie/summer-cards';
import {
  decideSummerCard,
  submitSummerCard,
} from '@/lib/ovie/summer-cards.server';
import { isReservedPublicProfileIdentity } from '@/lib/profile/public-profile-identity-policy';
import {
  lockSpotifyProfileIdentity,
  SpotifyProfileIdentityConflictError,
} from '@/lib/profile/spotify-profile-identity';
import { refundFirstMonthAndCancel } from '@/lib/stripe/claim-rejection-refund';
import { logger } from '@/lib/utils/logger';
import {
  CLAIM_VERIFICATION_SETTINGS_KEY,
  type ClaimVerificationDecision,
  type ClaimVerificationRecord,
  type ClaimVerificationStatus,
  decideClaimVerificationRecord,
  readClaimVerification,
  withClaimVerification,
} from './claim-verification';

/**
 * Minimal operator review for held high-reach claims: a decision card in the
 * admin Ovie inbox, an admin list, approve (link the artist) and reject
 * (refund first month + cancel; explicit operator decision only).
 */
/** Summer card idempotency keys for claim cards start with this. */
export const CLAIM_VERIFICATION_CARD_PREFIX = 'claim-verification_';

export function claimVerificationCardKey(profileId: string): string {
  return `${CLAIM_VERIFICATION_CARD_PREFIX}${profileId}`;
}

/** Profile id from a claim card's idempotency key, or null for other cards. */
export function profileIdFromClaimCardKey(key: string): string | null {
  return key.startsWith(CLAIM_VERIFICATION_CARD_PREFIX)
    ? key.slice(CLAIM_VERIFICATION_CARD_PREFIX.length) || null
    : null;
}

function httpsOnly(url: string): string | null {
  return url.startsWith('https://') ? url : null;
}

/**
 * File the review card. The payload is derived only from the stored record,
 * so webhook retries replay the same card instead of conflicting.
 */
export async function fileClaimVerificationCard(input: {
  readonly profileId: string;
  readonly handle: string;
  readonly record: ClaimVerificationRecord;
}): Promise<void> {
  const { record } = input;
  if (record.status !== 'pending_verification') return;
  const artist = record.artistName ?? record.spotifyArtistId;
  const evidence = [
    httpsOnly(`https://open.spotify.com/artist/${record.spotifyArtistId}`),
    httpsOnly(`${BASE_URL}/${input.handle}`),
  ].filter((url): url is string => url !== null);

  const result = await submitSummerCard({
    idempotencyKey: claimVerificationCardKey(input.profileId),
    kind: 'decision',
    product: 'jov',
    title: `Verify artist claim: ${artist}`.slice(0, 120),
    body: [
      `@${input.handle} paid $12 and asked to link ${artist} (${record.reach.value.toLocaleString('en-US')} Spotify followers, threshold ${record.reach.threshold.toLocaleString('en-US')}).`,
      `Requested ${record.requestedAt}, paid ${record.paidAt ?? 'unknown'}.`,
      'Approve links the artist to their profile. Reject refunds the first month and cancels the subscription.',
    ].join('\n'),
    recommendation:
      'Approve only with ownership evidence (artist email domain, verified social, distributor account). Otherwise reject.',
    defaultIfSilent:
      'Stays pending; the artist is not linked and no refund runs.',
    recipient: null,
    amountUsd: null,
    preflightReceiptId: null,
    evidence,
    // No automatic default (coordinator decision 2026-10-21): auto-reject
    // would turn away a paying customer and auto-approve would defeat the
    // guard. The card escalates on Home at 24h and 48h instead.
    decideBy: null,
    defaultDecision: 'none',
  });
  if (result.outcome === 'conflict') {
    throw new Error(
      `Claim verification card conflict for profile ${input.profileId}`
    );
  }
}

export interface ClaimVerificationListItem {
  readonly profileId: string;
  readonly handle: string;
  readonly userId: string | null;
  readonly email: string | null;
  readonly record: ClaimVerificationRecord;
}

export async function listClaimVerifications(
  status: ClaimVerificationStatus = 'pending_verification',
  limit = 100
): Promise<ClaimVerificationListItem[]> {
  const statusExpr = drizzleSql`${creatorProfiles.settings}->${CLAIM_VERIFICATION_SETTINGS_KEY}->>'status'`;
  const rows = await db
    .select({
      profileId: creatorProfiles.id,
      handle: creatorProfiles.usernameNormalized,
      userId: creatorProfiles.userId,
      email: users.email,
      settings: creatorProfiles.settings,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(drizzleSql`${statusExpr} = ${status}`)
    .limit(limit);

  return rows.flatMap(({ settings, ...row }) => {
    const record = readClaimVerification(settings);
    return record
      ? [
          {
            ...row,
            userId: row.userId ?? null,
            email: row.email ?? null,
            record,
          },
        ]
      : [];
  });
}

export type ClaimVerificationDecisionResult =
  | { readonly outcome: 'decided'; readonly record: ClaimVerificationRecord }
  | { readonly outcome: 'not_found' }
  | {
      readonly outcome: 'not_pending';
      readonly record: ClaimVerificationRecord;
    }
  | { readonly outcome: 'identity_conflict' }
  | { readonly outcome: 'no_subscription' };

/**
 * High-reach artists usually already have a prebuilt, unclaimed profile that
 * holds their Spotify ID. A verified claim takes the identity over: the
 * prebuilt row gives up the Spotify ID, is hidden, and records where the
 * identity went (reversible by an operator). A claimed profile, a profile
 * another account holds, or a reserved fixture identity is never released.
 */
async function releasePrebuiltSpotifyIdentity(
  tx: DbOrTransaction,
  input: { readonly spotifyArtistId: string; readonly toProfileId: string }
): Promise<string[]> {
  await lockSpotifyProfileIdentity(tx, input.spotifyArtistId);
  const holders = await tx
    .select({
      id: creatorProfiles.id,
      handle: creatorProfiles.usernameNormalized,
      isClaimed: creatorProfiles.isClaimed,
      userId: creatorProfiles.userId,
      settings: creatorProfiles.settings,
    })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.spotifyId, input.spotifyArtistId),
        ne(creatorProfiles.id, input.toProfileId)
      )
    );

  const releasable = holders.every(
    holder =>
      holder.isClaimed !== true &&
      !holder.userId &&
      !isReservedPublicProfileIdentity(holder.handle)
  );
  if (!releasable) throw new SpotifyProfileIdentityConflictError();

  const at = new Date();
  for (const holder of holders) {
    const settings =
      holder.settings && typeof holder.settings === 'object'
        ? (holder.settings as Record<string, unknown>)
        : {};
    await tx
      .update(creatorProfiles)
      .set({
        spotifyId: null,
        spotifyUrl: null,
        isPublic: false,
        settings: {
          ...settings,
          supersededByVerifiedClaim: {
            toProfileId: input.toProfileId,
            spotifyArtistId: input.spotifyArtistId,
            at: at.toISOString(),
          },
        },
        updatedAt: at,
      })
      .where(eq(creatorProfiles.id, holder.id));
    logger.info(
      'Prebuilt profile released Spotify identity to verified claim',
      {
        fromProfileId: holder.id,
        toProfileId: input.toProfileId,
      }
    );
  }
  return holders.map(holder => holder.handle);
}

async function linkVerifiedArtist(input: {
  readonly profileId: string;
  readonly settings: unknown;
  readonly next: ClaimVerificationRecord;
}): Promise<string[]> {
  const { next } = input;
  const base =
    input.settings && typeof input.settings === 'object'
      ? (input.settings as Record<string, unknown>)
      : {};
  return withSystemIngestionSession(async tx => {
    const released = await releasePrebuiltSpotifyIdentity(tx, {
      spotifyArtistId: next.spotifyArtistId,
      toProfileId: input.profileId,
    });
    await tx
      .update(creatorProfiles)
      .set({
        spotifyId: next.spotifyArtistId,
        spotifyUrl: `https://open.spotify.com/artist/${next.spotifyArtistId}`,
        settings: withClaimVerification(
          {
            ...base,
            spotifyArtistName: next.artistName ?? base.spotifyArtistName,
            spotifyImportStatus: 'importing',
            spotifyImportTotal: 0,
          },
          next
        ),
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, input.profileId));
    return released;
  });
}

async function importAfterLink(profileId: string): Promise<void> {
  try {
    await syncReleasesFromSpotify(profileId, { includeTracks: true });
  } catch (error) {
    // The link is committed; the import can be retried from the dashboard.
    await captureError(
      'Release import after claim verification failed',
      error,
      {
        route: 'lib/claim/claim-verification-review.server',
      }
    );
  }
}

/**
 * Operator decision. Approve links the artist (identity lock, same fields as
 * self-serve connect) and imports releases. Reject refunds the first month and
 * cancels the subscription, then records the decision. Only
 * `pending_verification` can be decided, so a repeated click is a no-op.
 */
export async function decideClaimVerification(input: {
  readonly profileId: string;
  readonly decision: ClaimVerificationDecision;
  readonly decidedBy: string | null;
  readonly reason?: string | null;
  /** Set when the decision came from the Summer card itself. */
  readonly fromCard?: boolean;
  readonly now?: Date;
}): Promise<ClaimVerificationDecisionResult> {
  const now = input.now ?? new Date();
  const [row] = await db
    .select({
      handle: creatorProfiles.usernameNormalized,
      settings: creatorProfiles.settings,
      userId: creatorProfiles.userId,
      subscriptionId: users.stripeSubscriptionId,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.id, input.profileId))
    .limit(1);
  if (!row) return { outcome: 'not_found' };

  const current = readClaimVerification(row.settings);
  if (!current) return { outcome: 'not_found' };
  if (current.status !== 'pending_verification') {
    return { outcome: 'not_pending', record: current };
  }

  let refundId: string | null = null;
  if (input.decision === 'reject') {
    if (!row.subscriptionId) return { outcome: 'no_subscription' };
    const refund = await refundFirstMonthAndCancel({
      subscriptionId: row.subscriptionId,
      idempotencyKey: `claim-verification-reject:${input.profileId}`,
    });
    refundId = refund.refundId;
  }

  const next = decideClaimVerificationRecord(current, {
    decision: input.decision,
    decidedAt: now,
    decidedBy: input.decidedBy,
    reason: input.reason ?? null,
    refundId,
  });
  if (!next) return { outcome: 'not_pending', record: current };

  let releasedHandles: string[] = [];
  if (input.decision === 'approve') {
    try {
      releasedHandles = await linkVerifiedArtist({
        profileId: input.profileId,
        settings: row.settings,
        next,
      });
    } catch (error) {
      if (error instanceof SpotifyProfileIdentityConflictError) {
        return { outcome: 'identity_conflict' };
      }
      throw error;
    }
  } else {
    await db
      .update(creatorProfiles)
      .set({
        settings: withClaimVerification(row.settings, next),
        updatedAt: now,
      })
      .where(eq(creatorProfiles.id, input.profileId));
  }

  logger.info('Claim verification decided', {
    profileId: input.profileId,
    decision: input.decision,
    refundId,
  });

  await recordArtistOfferStage(
    next.acquisitionId,
    input.decision === 'approve' ? 'claim-verified' : 'claim-rejected',
    now
  );

  if (!input.fromCard) {
    // Keep Tim's queue truthful when the decision came from the admin API.
    try {
      await decideSummerCard({
        id: summerCardId(claimVerificationCardKey(input.profileId)),
        decision: input.decision,
        comment: input.reason ?? null,
        decidedBy: input.decidedBy,
      });
    } catch (error) {
      await captureError('Claim verification card sync failed', error, {
        route: 'lib/claim/claim-verification-review.server',
      });
    }
  }

  if (input.decision === 'approve') {
    await Promise.allSettled(
      [row.handle, ...releasedHandles].map(handle =>
        invalidateProfileCache(handle)
      )
    );
    await importAfterLink(input.profileId);
  }

  return { outcome: 'decided', record: next };
}
