import 'server-only';

import { and, asc, sql as drizzleSql, eq } from 'drizzle-orm';
import { generateProofCode } from '@/lib/claim/proof-code';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { logger } from '@/lib/utils/logger';
import {
  CLAIM_VERIFICATION_REACH_THRESHOLD,
  type ClaimVerificationRecord,
  readClaimVerification,
} from './claim-verification';
import { markLegacyNudgeSent, requireLegacyProof } from './legacy-verification';

/** Rows per daily run; the rest wait for the next day. */
export const LEGACY_SWEEP_BATCH = 200;

export interface LegacySweepResult {
  readonly skipped: boolean;
  readonly scanned: number;
  readonly nudged: number;
  readonly proofRequired: number;
}

/**
 * Lazy: the review module pulls in Stripe and the Ovie card store, which this
 * daily sweep needs only when a high-reach page goes back to proof.
 */
async function fileReviewCard(
  input: Parameters<
    typeof import('./claim-verification-review.server').fileClaimVerificationCard
  >[0]
): Promise<void> {
  const review = await import('./claim-verification-review.server');
  await review.fileClaimVerificationCard(input);
}

/**
 * Replaces only the claim-verification key, and only while the row is still
 * the legacy record this run read, so a concurrent decision or settings edit
 * is never overwritten. Returns whether the row changed.
 */
async function writeLegacyTransition(
  profileId: string,
  next: ClaimVerificationRecord,
  makePrivate: boolean
): Promise<boolean> {
  const rows = await db
    .update(creatorProfiles)
    .set({
      settings: drizzleSql`jsonb_set(coalesce(${creatorProfiles.settings}, '{}'::jsonb), '{claimVerification}', ${JSON.stringify(next)}::jsonb)`,
      ...(makePrivate ? { isPublic: false } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creatorProfiles.id, profileId),
        drizzleSql`${creatorProfiles.settings} -> 'claimVerification' ->> 'proofMethod' = 'legacy'`,
        drizzleSql`${creatorProfiles.settings} -> 'claimVerification' ->> 'status' = 'verified'`
      )
    )
    .returning({ id: creatorProfiles.id });
  return rows.length > 0;
}

/**
 * Daily sweep over grandfathered claims (spec Q2). Idempotent: a nudge stage
 * is stamped once, and a high-reach claim past its 30-day window becomes a
 * proof-only request (the proof-before-public trigger keeps it private) with
 * a review card for the operator. Disputed claims are left to the dispute
 * flow, which keeps the page up frozen.
 *
 * Behind CLAIM_LEGACY_PROOF_SWEEP (default off) so the first run that takes
 * pages private is a deliberate, observable flip.
 */
export async function runLegacyClaimVerificationSweep(
  now: Date = new Date()
): Promise<LegacySweepResult> {
  if (!isCodeFlagEnabled('CLAIM_LEGACY_PROOF_SWEEP')) {
    return { skipped: true, scanned: 0, nudged: 0, proofRequired: 0 };
  }

  const record = drizzleSql`${creatorProfiles.settings} -> 'claimVerification'`;
  const rows = await db
    .select({
      id: creatorProfiles.id,
      handle: creatorProfiles.usernameNormalized,
      settings: creatorProfiles.settings,
      followers: creatorProfiles.spotifyFollowers,
    })
    .from(creatorProfiles)
    .where(
      and(
        drizzleSql`${record} ->> 'proofMethod' = 'legacy'`,
        drizzleSql`${record} ->> 'status' = 'verified'`,
        // Rows with nothing left to do drop out, so the batch never starves.
        drizzleSql`(${record} ->> 'nudgeSentAt' IS NULL OR (
          coalesce(${record} ->> 'legacyNudgeDueAt', '') <= ${now.toISOString()}
          AND greatest(
            coalesce(${creatorProfiles.spotifyFollowers}, 0),
            coalesce((${record} -> 'reach' ->> 'value')::numeric, 0)
          ) >= ${CLAIM_VERIFICATION_REACH_THRESHOLD}
        ))`
      )
    )
    .orderBy(asc(creatorProfiles.id))
    .limit(LEGACY_SWEEP_BATCH);

  let nudged = 0;
  let proofRequired = 0;
  for (const row of rows) {
    const current = readClaimVerification(row.settings);
    const reopened = requireLegacyProof(current, {
      now,
      currentReach: row.followers,
      proofCode: generateProofCode(),
    });
    if (reopened) {
      if (await writeLegacyTransition(row.id, reopened, true)) {
        proofRequired += 1;
        logger.info('Legacy claim requires proof', {
          profileId: row.id,
          spotifyArtistId: reopened.spotifyArtistId,
          reach: reopened.reach.value,
        });
        await fileReviewCard({
          profileId: row.id,
          handle: row.handle ?? row.id,
          record: reopened,
        });
      }
      continue;
    }
    // TODO(claim-verify spec Q2): send the 30-day nudge email here once its
    // copy passes the copywriting gate. Today the nudge is the dashboard
    // payload (`legacyNudge`); this stamp records the stage.
    const stamped = markLegacyNudgeSent(current, now, row.followers);
    if (stamped && (await writeLegacyTransition(row.id, stamped, false))) {
      nudged += 1;
    }
  }

  return { skipped: false, scanned: rows.length, nudged, proofRequired };
}
