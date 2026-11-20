import 'server-only';

import { and, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { recordArtistOfferStage } from '@/lib/acquisition/artist-offer-funnel.server';
import { recordFunnelStep } from '@/lib/analytics/signup-funnel.server';
import { withDbSessionTx } from '@/lib/auth/session';
import { requiresClaimVerification } from '@/lib/claim/claim-verification';
import {
  getClaimVerificationReach,
  requestClaimVerification,
} from '@/lib/claim/claim-verification.server';
import { type DbOrTransaction, db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db/errors';
import { users } from '@/lib/db/schema/auth';
import {
  chatAuditLog,
  chatConversations,
  chatMessages,
} from '@/lib/db/schema/chat';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import {
  fetchArtistBySpotifyUrl,
  type MusicFetchArtistResult,
} from '@/lib/dsp-enrichment/providers/musicfetch';
import { captureError } from '@/lib/error-tracking';
import { isHandleUniqueViolation } from '@/lib/errors/onboarding';
import { isMusicfetchVendorUnavailable } from '@/lib/musicfetch/errors';
import { captureRevenueSpineFailure } from '@/lib/observability/revenue-spine';
import { scheduleOnboardingCatalogImport } from '@/lib/onboarding/catalog-import.server';
import {
  buildImportedProfileFields,
  buildOnboardingSettings,
  type HeldClaimVerification,
} from '@/lib/onboarding/claim-profile-settings';
import {
  type ClaimedOnboardingState,
  deriveClaimedOnboardingStateFromMessageRows,
} from '@/lib/onboarding/claimed-state';
import {
  assertOnboardingProfileOwner,
  describeArtistProfileForVisitor,
  requireVerifiedOwnerForReservation,
} from '@/lib/onboarding/ownership-gate';
import { reserveOnboardingHandle } from '@/lib/onboarding/reserved-handle';
import {
  assertSpotifyProfileIdentityAvailable,
  lockSpotifyProfileIdentity,
  SpotifyProfileIdentityConflictError,
} from '@/lib/profile/spotify-profile-identity';
import { ensureChatWorkRecord } from '@/lib/tasks/chat-work-record';
import { ACQUISITION_COOKIE_NAME } from '@/lib/tracking/consent';
import {
  type AccountMetricCohort,
  getAccountMetricCohort,
} from '@/lib/utils/email';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

type CreatorProfile = typeof creatorProfiles.$inferSelect;

const HANDLE_CLAIM_MAX_ATTEMPTS = 5;

export interface MaterializeClaimedOnboardingProfileInput {
  readonly userId: string;
  readonly conversationId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  /**
   * 'unproven' (default) claims the profile but keeps it private until the
   * claimant proves they control the artist identity (Tim, 2026-11-02); with
   * no artist identity there is nothing to prove and the page is ordinary.
   * 'public' is only for claims an operator already vouched for. 'reserved'
   * holds the handle on a hidden, unclaimed profile so a pending waitlist
   * decision still protects jov.ie/<handle> until approval flips it public.
   */
  readonly visibility?: 'public' | 'reserved' | 'unproven';
  /** Durable waitlist receipt this reservation belongs to (reserved mode). */
  readonly waitlistEntryId?: string | null;
}

export interface MaterializeClaimedOnboardingProfileResult {
  readonly profileId: string | null;
  readonly handle: string | null;
  readonly status: 'created' | 'updated' | 'skipped';
}

function cleanProposedHandle(handle: string | null): string | null {
  if (!handle) return null;
  const normalized = normalizeUsername(handle.replace(/^@/, ''));
  return validateUsername(normalized).isValid ? normalized : null;
}

async function fetchExistingProfile(
  userId: string,
  database: DbOrTransaction
): Promise<CreatorProfile | null> {
  const [profile] = await database
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .orderBy(
      desc(creatorProfiles.isClaimed),
      desc(creatorProfiles.onboardingCompletedAt),
      desc(creatorProfiles.updatedAt)
    )
    .limit(1)
    .for('update');

  return profile ?? null;
}

function pickInitialProfileHandle(
  proposedHandle: string | null
): string | null {
  return cleanProposedHandle(proposedHandle);
}

async function reserveFallbackProfileHandle(
  state: ClaimedOnboardingState,
  cleanedProposedHandle: string | null,
  userId: string,
  heldArtistName: string | null = null
): Promise<string> {
  return reserveOnboardingHandle(
    state.artist?.name ?? cleanedProposedHandle ?? heldArtistName ?? 'profile',
    userId
  );
}

/**
 * Claim integrity: a high-reach artist from the transcript is not attached to
 * the new profile. The profile materializes from the handle alone and the
 * artist becomes a verification request (lib/claim/claim-verification.ts).
 */
async function holdHighReachArtistForVerification(
  state: ClaimedOnboardingState,
  options: { readonly forceHold?: boolean } = {}
): Promise<{
  readonly state: ClaimedOnboardingState;
  readonly verification: HeldClaimVerification | null;
}> {
  const artist = state.artist;
  if (!artist) return { state, verification: null };
  const reach = requiresClaimVerification(artist.followers)
    ? artist.followers
    : options.forceHold
      ? // Unknown reach still holds the identity (fail closed).
        (artist.followers ?? 0)
      : await getClaimVerificationReach(artist.id);
  if (reach === null) return { state, verification: null };
  return {
    state: { ...state, artist: null },
    verification: {
      spotifyArtistId: artist.id,
      artistName: artist.name ?? null,
      reach,
    },
  };
}

function hasMaterializableState(
  state: ClaimedOnboardingState,
  verification: HeldClaimVerification | null
): boolean {
  return Boolean(state.artist || state.handle || verification);
}

async function fetchMusicFetchProfile(
  state: ClaimedOnboardingState
): Promise<MusicFetchArtistResult | null> {
  if (!state.artist?.url) return null;

  try {
    return await fetchArtistBySpotifyUrl(state.artist.url);
  } catch (error) {
    if (isMusicfetchVendorUnavailable(error)) {
      return null;
    }
    await captureError(
      'MusicFetch profile import failed during chat claim',
      error,
      {
        route: 'onboarding_claim_profile',
        spotifyArtistId: state.artist.id,
      }
    );
    return null;
  }
}

interface PersistClaimedProfileInput {
  readonly creatorType: CreatorProfile['creatorType'];
  readonly tx: DbOrTransaction;
  readonly userId: string;
  readonly handle: string;
  readonly existingProfile: CreatorProfile | null;
  readonly displayName: string;
  readonly settings: Record<string, unknown>;
  readonly now: Date;
  readonly spotifyFields: Record<string, unknown>;
  readonly reserved: boolean;
  /** Admitted but unproven: claimed and managed by the owner, never public. */
  readonly unproven: boolean;
  readonly waitlistEntryId: string | null;
}

async function persistClaimedProfileRow({
  creatorType,
  tx,
  userId,
  handle,
  existingProfile,
  displayName,
  settings,
  now,
  spotifyFields,
  reserved,
  unproven,
  waitlistEntryId,
}: PersistClaimedProfileInput): Promise<{
  profileId: string;
  status: 'created' | 'updated';
}> {
  if (existingProfile) {
    const [updated] = await tx
      .update(creatorProfiles)
      .set({
        username: handle,
        usernameNormalized: handle,
        displayName:
          existingProfile.displayNameLocked && existingProfile.displayName
            ? existingProfile.displayName
            : displayName,
        // A reserved refresh must not downgrade a profile that is already
        // claimed/public, and must not publish a still-pending reservation.
        ...(reserved
          ? {}
          : {
              // Unproven never publishes; it also never un-publishes a page
              // that proof already made public.
              ...(unproven ? {} : { isPublic: true }),
              isClaimed: true,
              claimedAt: existingProfile.claimedAt ?? now,
              onboardingCompletedAt:
                existingProfile.onboardingCompletedAt ?? now,
            }),
        ...(waitlistEntryId ? { waitlistEntryId } : {}),
        settings,
        updatedAt: now,
        ...spotifyFields,
      })
      .where(
        and(
          eq(creatorProfiles.id, existingProfile.id),
          eq(creatorProfiles.userId, userId)
        )
      )
      .returning({ id: creatorProfiles.id });

    if (!updated) throw new Error('Profile ownership changed during claim');
    return {
      profileId: updated.id,
      status: 'updated',
    };
  }

  const [created] = await tx
    .insert(creatorProfiles)
    .values({
      userId,
      waitlistEntryId,
      creatorType,
      username: handle,
      usernameNormalized: handle,
      displayName,
      isPublic: !reserved && !unproven,
      isClaimed: !reserved,
      claimedAt: reserved ? null : now,
      onboardingCompletedAt: reserved ? null : now,
      settings,
      theme: {},
      ingestionStatus: 'idle',
      ...spotifyFields,
    })
    .returning({ id: creatorProfiles.id });

  if (!created?.id) {
    throw new Error('Failed to create claimed onboarding profile');
  }

  return { profileId: created.id, status: 'created' };
}

async function persistClaimedProfileWithHandleRetry({
  userId,
  state,
  verification,
  conversationId,
  now,
  musicFetch,
  reserved,
  unproven,
  waitlistEntryId,
}: {
  readonly userId: string;
  readonly state: ClaimedOnboardingState;
  readonly verification: HeldClaimVerification | null;
  readonly conversationId: string;
  readonly now: Date;
  readonly musicFetch: MusicFetchArtistResult | null;
  readonly reserved: boolean;
  readonly unproven: boolean;
  readonly waitlistEntryId: string | null;
}): Promise<{
  profileId: string;
  handle: string;
  status: 'created' | 'updated';
}> {
  const cleanedProposedHandle = pickInitialProfileHandle(state.handle);
  let handle =
    cleanedProposedHandle ??
    (await reserveFallbackProfileHandle(
      state,
      cleanedProposedHandle,
      userId,
      verification?.artistName ?? null
    ));
  const targetSpotifyId =
    state.artist?.id ?? verification?.spotifyArtistId ?? null;

  for (let attempt = 0; attempt < HANDLE_CLAIM_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await withDbSessionTx(
        async tx => {
          if (targetSpotifyId)
            await lockSpotifyProfileIdentity(tx, targetSpotifyId);
          await tx.execute(
            drizzleSql`SELECT pg_advisory_xact_lock(hashtext('jovie:onboarding-profile-owner'), hashtext(${userId}))`
          );
          const [owner] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
          if (!owner) throw new Error('Profile owner not found');
          const existingProfile = await fetchExistingProfile(userId, tx);
          if (existingProfile) {
            assertOnboardingProfileOwner({
              authenticatedUserId: userId,
              profileOwnerUserId: existingProfile.userId,
            });
          }
          if (targetSpotifyId) {
            if (
              existingProfile?.spotifyId &&
              existingProfile.spotifyId !== targetSpotifyId
            ) {
              throw new SpotifyProfileIdentityConflictError();
            }
            await assertSpotifyProfileIdentityAvailable(
              tx,
              targetSpotifyId,
              existingProfile?.id ?? null
            );
          }
          return persistClaimedProfileRow({
            creatorType: state.profileDraft?.activeRole
              ? state.profileDraft.activeRole === 'artist'
                ? 'artist'
                : 'creator'
              : state.artist || verification
                ? 'artist'
                : 'creator',
            tx,
            userId,
            handle,
            existingProfile,
            displayName:
              state.artist?.name ??
              (unproven &&
              verification &&
              !requiresClaimVerification(verification.reach)
                ? verification.artistName
                : null) ??
              existingProfile?.displayName ??
              handle,
            settings: buildOnboardingSettings(
              existingProfile?.settings,
              state,
              conversationId,
              now,
              verification,
              unproven
            ),
            now,
            spotifyFields: buildImportedProfileFields({
              existingProfile,
              state,
              musicFetch,
            }),
            reserved,
            unproven,
            waitlistEntryId,
          });
        },
        { clerkUserId: userId }
      );
      return { ...result, handle };
    } catch (error) {
      if (isUniqueViolation(error, 'creator_profiles_spotify_id_unique')) {
        throw new SpotifyProfileIdentityConflictError();
      }
      if (
        !isHandleUniqueViolation(error) ||
        attempt === HANDLE_CLAIM_MAX_ATTEMPTS - 1
      )
        throw error;
      handle = await reserveFallbackProfileHandle(
        state,
        cleanedProposedHandle,
        userId,
        verification?.artistName ?? null
      );
    }
  }
  throw new Error('Failed to claim onboarding profile handle after retries');
}

export async function materializeClaimedOnboardingProfile(
  input: MaterializeClaimedOnboardingProfileInput
): Promise<MaterializeClaimedOnboardingProfileResult> {
  try {
    return await materializeProfile(input);
  } catch (error) {
    captureRevenueSpineFailure({
      stage: 'profile_claim',
      severity: 'blocked',
      userId: input.userId,
      error,
    });
    throw error;
  }
}

async function materializeProfile({
  userId,
  conversationId,
  ipAddress,
  userAgent,
  visibility = 'unproven',
  waitlistEntryId = null,
}: MaterializeClaimedOnboardingProfileInput): Promise<MaterializeClaimedOnboardingProfileResult> {
  const reserved = visibility === 'reserved';
  const requestedUnproven = visibility === 'unproven';
  // Auth first (no DB): refuse anonymous materialize / reserve success.
  const { userId: authenticatedUserId } = requireVerifiedOwnerForReservation({
    userId,
  });

  // Conversation ownership: never materialize / "manage as owner" for a
  // transcript the caller does not own.
  const [conversation] = await db
    .select({
      id: chatConversations.id,
      userId: chatConversations.userId,
    })
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);

  const { userId: verifiedUserId } = requireVerifiedOwnerForReservation({
    userId: authenticatedUserId,
    conversationExists: Boolean(conversation),
    conversationUserId: conversation?.userId ?? null,
  });

  const messageRows = await db
    .select({ toolCalls: chatMessages.toolCalls })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(chatMessages.createdAt);

  const { state, verification } = await holdHighReachArtistForVerification(
    deriveClaimedOnboardingStateFromMessageRows(messageRows),
    { forceHold: requestedUnproven }
  );
  const unproven = requestedUnproven && verification !== null;
  if (!hasMaterializableState(state, verification)) {
    return { profileId: null, handle: null, status: 'skipped' };
  }

  const now = new Date();
  const musicFetch = await fetchMusicFetchProfile(state);
  const { profileId, handle, status } =
    await persistClaimedProfileWithHandleRetry({
      userId: verifiedUserId,
      state,
      verification,
      conversationId,
      now,
      musicFetch,
      reserved,
      unproven,
      waitlistEntryId,
    });

  // JOV-9758: import catalog for attached identities; held identities import on approval.
  if (state.artist?.id && profileId) {
    scheduleOnboardingCatalogImport({
      profileId,
      spotifyArtistId: state.artist.id,
      spotifyArtistUrl: state.artist.url,
      userId: verifiedUserId,
    });
  }

  if (verification) {
    await requestClaimVerification({
      profileId,
      spotifyArtistId: verification.spotifyArtistId,
      artistName: verification.artistName,
      reach: verification.reach,
      paid: false,
      proofOnly: unproven,
      now,
    });
  }

  // A reserved (waitlist-pending) profile only holds the handle. Publishing
  // ownership signals — activeProfileId and the owner claim row — happens on
  // the admitted claim path so nothing treats the reservation as admission.
  let claimCohort: AccountMetricCohort = 'unattributed';
  if (!reserved) {
    const [owner] = await db
      .update(users)
      .set({ activeProfileId: profileId, updatedAt: now })
      .where(eq(users.id, verifiedUserId))
      .returning({ email: users.email });
    claimCohort = getAccountMetricCohort(owner?.email);

    // "Manage as owner" claim row — only after verified ownership above.
    await withDbSessionTx(
      tx =>
        tx
          .insert(userProfileClaims)
          .values({
            userId: verifiedUserId,
            creatorProfileId: profileId,
            role: 'owner',
          })
          .onConflictDoNothing(),
      { clerkUserId: verifiedUserId }
    );
  }

  await db
    .update(chatConversations)
    .set({ creatorProfileId: profileId, updatedAt: now })
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.userId, verifiedUserId)
      )
    );

  // JOV-4514: the claimed conversation now has an owner — attach its durable
  // work record. Idempotent; non-fatal so a failure never blocks the claim.
  if (profileId) {
    try {
      await ensureChatWorkRecord({
        conversationId,
        creatorProfileId: profileId,
      });
    } catch (error) {
      await captureError('Failed to create chat work record', error, {
        operation: 'materialize_claimed_onboarding_profile',
        conversationId,
        profileId,
      });
    }
  }

  const resolvedArtistName =
    state.artist?.name ?? verification?.artistName ?? null;
  const artistLabel = describeArtistProfileForVisitor({
    ownershipVerified: true,
    artistName: resolvedArtistName,
  });

  await db.insert(chatAuditLog).values({
    userId: verifiedUserId,
    creatorProfileId: profileId,
    conversationId,
    action: 'materialize_onboarding_profile',
    field: 'creator_profile_id',
    previousValue: null,
    newValue: profileId,
    metadata: {
      handle,
      status,
      visibility: reserved ? 'reserved' : unproven ? 'unproven' : 'public',
      waitlistEntryId,
      spotifyArtistId:
        state.artist?.id ?? verification?.spotifyArtistId ?? null,
      spotifyArtistName: resolvedArtistName,
      // Neutral, ownership-verified label (never pre-verify "you" language).
      artistProfileLabel: artistLabel,
    },
    ipAddress,
    userAgent,
  });

  if (!reserved) {
    await recordFunnelStep({
      funnel: 'artist_signup',
      step: 'claim_complete',
      cohort: claimCohort,
    });
    await recordClaimedStage();
  }

  return { profileId, handle, status };
}

/** Journey-keyed golden-path stage. Never throws; no consent cookie, no row. */
async function recordClaimedStage(): Promise<void> {
  try {
    const cookieStore = await cookies();
    await recordArtistOfferStage(
      cookieStore.get(ACQUISITION_COOKIE_NAME)?.value,
      'claimed'
    );
  } catch {
    // Measurement only: a request without a cookie store records nothing.
  }
}
