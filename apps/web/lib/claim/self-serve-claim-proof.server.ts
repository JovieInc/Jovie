import 'server-only';

import {
  buildSelfServeClaimProof,
  type ClaimVerificationRecord,
  isProofBlockingPublication,
  withClaimVerification,
} from '@/lib/claim/claim-verification';
import { scheduleClaimVerificationCard } from '@/lib/claim/claim-verification.server';
import { generateProofCode } from '@/lib/claim/proof-code';
import type { DbOrTransaction } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import {
  type ServerAnalyticsDelivery,
  trackServerEventTx,
} from '@/lib/server-analytics';

/** Durable onboarding funnel events are part of the claim: a rejection throws. */
export async function requireFunnelDelivery(
  event: string,
  delivery: ServerAnalyticsDelivery
): Promise<void> {
  if (delivery.ok) return;

  const error = new Error(
    `Onboarding Spotify funnel event rejected: ${event} (${delivery.error})`
  );
  await captureError('onboarding Spotify funnel event rejected', error, {
    action: 'connectOnboardingSpotifyArtist',
    event,
  });
  throw error;
}

interface SelfServeClaimProof {
  /** The record written with the identity, or null when nothing changes. */
  readonly record: ClaimVerificationRecord | null;
  /** True while the page stays private waiting for ownership proof. */
  readonly proofPending: boolean;
  /** Settings to write in the same update that links the identity. */
  apply(settings: Record<string, unknown>): Record<string, unknown>;
  /** `claim_private_created`, committed with the claim transaction. */
  recordCreated(tx: DbOrTransaction): Promise<void>;
  /** Files the operator review card after the response. */
  scheduleReview(): void;
}

/**
 * Claim integrity (Tim, 2026-11-02): an exact Spotify-ID match is not proof
 * of ownership. A non-admin claim that attaches a Spotify identity stores a
 * proof-only `pending_verification` request with a proof code in the same
 * write, so the proof-before-public trigger keeps the page private. No
 * network call runs on the claim path; the review card files after it.
 */
export function prepareSelfServeClaimProof(input: {
  readonly profile: {
    readonly id: string;
    readonly handle: string;
    readonly isAdmin: boolean | null;
    readonly spotifyId: string | null;
  };
  readonly settings: Record<string, unknown>;
  readonly spotifyArtistId: string;
  readonly artistName: string | null;
  /** A prebuilt profile claimed by its Spotify match. */
  readonly directClaim: boolean;
}): SelfServeClaimProof {
  const { profile } = input;
  const attachesIdentity =
    input.directClaim || profile.spotifyId !== input.spotifyArtistId;
  const record =
    profile.isAdmin !== true && attachesIdentity
      ? buildSelfServeClaimProof({
          settings: input.settings,
          spotifyArtistId: input.spotifyArtistId,
          artistName: input.artistName,
          followers: null,
          proofCode: generateProofCode(),
          now: new Date(),
        })
      : null;
  const apply = (settings: Record<string, unknown>) =>
    record ? withClaimVerification(settings, record) : settings;

  return {
    record,
    proofPending: isProofBlockingPublication(apply(input.settings)),
    apply,
    async recordCreated(tx) {
      if (!record) return;
      const requestedAtMs = Date.parse(record.requestedAt);
      await requireFunnelDelivery(
        'claim_private_created',
        await trackServerEventTx(
          tx,
          'claim_private_created',
          {
            profileId: profile.id,
            source: input.directClaim
              ? 'direct_profile_spotify_match'
              : 'onboarding_spotify_connect',
            requestedAtMs,
          },
          {
            eventIdentity: `claim_private_created:${profile.id}:${requestedAtMs}`,
          }
        )
      );
    },
    scheduleReview() {
      if (!record) return;
      scheduleClaimVerificationCard({
        profileId: profile.id,
        handle: profile.handle,
        record,
      });
    },
  };
}
