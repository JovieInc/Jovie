import 'server-only';

import { and, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { recordFunnelStep } from '@/lib/analytics/signup-funnel.server';
import { withDbSessionTx } from '@/lib/auth/session';
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
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

type CreatorProfile = typeof creatorProfiles.$inferSelect;

const HANDLE_CLAIM_MAX_ATTEMPTS = 5;
const MAX_IMPORTED_BIO_LENGTH = 2_000;

export interface MaterializeClaimedOnboardingProfileInput {
  readonly userId: string;
  readonly conversationId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  /**
   * 'public' (default) publishes a claimed, live profile. 'reserved' holds the
   * handle on a hidden, unclaimed profile so a pending waitlist decision still
   * protects jov.ie/<handle> until approval flips it public.
   */
  readonly visibility?: 'public' | 'reserved';
  /** Durable waitlist receipt this reservation belongs to (reserved mode). */
  readonly waitlistEntryId?: string | null;
}

export interface MaterializeClaimedOnboardingProfileResult {
  readonly profileId: string | null;
  readonly handle: string | null;
  readonly status: 'created' | 'updated' | 'skipped';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  userId: string
): Promise<string> {
  // Fail closed: handle reservation success requires verified ownership.
  return reserveOnboardingHandle(
    state.artist?.name ?? cleanedProposedHandle ?? 'artist',
    userId
  );
}

function buildOnboardingSettings(
  existingSettings: unknown,
  state: ClaimedOnboardingState,
  conversationId: string,
  claimedAt: Date
): Record<string, unknown> {
  const base = isRecord(existingSettings) ? existingSettings : {};
  const onboarding = isRecord(base.onboarding) ? base.onboarding : {};

  return {
    ...base,
    onboarding: {
      ...onboarding,
      claimedConversationId: conversationId,
      claimedAt: claimedAt.toISOString(),
      selectedSpotifyArtistId: state.artist?.id ?? null,
      selectedSpotifyArtistName: state.artist?.name ?? null,
      socialLinks: [...state.socialLinks],
      interviewSignalCount: state.interviewSignals.length,
    },
  };
}

function hasMaterializableState(state: ClaimedOnboardingState): boolean {
  return Boolean(state.artist || state.handle);
}

function cleanImportedBio(bio: string | null | undefined): string | null {
  const cleaned = bio?.trim().replaceAll(/\s+/g, ' ') ?? '';
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_IMPORTED_BIO_LENGTH);
}

function cleanSpotifyAvatarUrl(
  imageUrl: string | null | undefined
): string | null {
  const cleaned = imageUrl?.trim();
  if (!cleaned) return null;

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:') return null;
    if (
      parsed.hostname === 'i.scdn.co' ||
      parsed.hostname.endsWith('.scdn.co')
    ) {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

async function fetchMusicFetchProfile(
  state: ClaimedOnboardingState
): Promise<MusicFetchArtistResult | null> {
  if (!state.artist?.url) return null;

  try {
    return await fetchArtistBySpotifyUrl(state.artist.url);
  } catch (error) {
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

function buildImportedProfileFields({
  existingProfile,
  state,
  musicFetch,
}: {
  readonly musicFetch: MusicFetchArtistResult | null;
  readonly existingProfile: CreatorProfile | null;
  readonly state: ClaimedOnboardingState;
}): Record<string, unknown> {
  if (!state.artist) return {};

  const importedBio = cleanImportedBio(musicFetch?.bio);
  const importedAvatarUrl =
    cleanSpotifyAvatarUrl(state.artist.imageUrl) ??
    cleanSpotifyAvatarUrl(musicFetch?.image?.url);

  return {
    avatarUrl:
      existingProfile?.avatarLockedByUser && existingProfile.avatarUrl
        ? existingProfile.avatarUrl
        : (importedAvatarUrl ?? existingProfile?.avatarUrl ?? null),
    ...(importedBio && !existingProfile?.bio ? { bio: importedBio } : {}),
    spotifyId: state.artist.id,
    spotifyUrl: state.artist.url,
    spotifyFollowers: state.artist.followers,
    spotifyPopularity: state.artist.popularity,
    genres: [...state.artist.genres],
  };
}

interface PersistClaimedProfileInput {
  readonly tx: DbOrTransaction;
  readonly userId: string;
  readonly handle: string;
  readonly existingProfile: CreatorProfile | null;
  readonly displayName: string;
  readonly settings: Record<string, unknown>;
  readonly now: Date;
  readonly spotifyFields: Record<string, unknown>;
  readonly reserved: boolean;
  readonly waitlistEntryId: string | null;
}

async function persistClaimedProfileRow({
  tx,
  userId,
  handle,
  existingProfile,
  displayName,
  settings,
  now,
  spotifyFields,
  reserved,
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
              isPublic: true,
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
      creatorType: 'artist',
      username: handle,
      usernameNormalized: handle,
      displayName,
      isPublic: !reserved,
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
  conversationId,
  now,
  musicFetch,
  reserved,
  waitlistEntryId,
}: {
  readonly userId: string;
  readonly state: ClaimedOnboardingState;
  readonly conversationId: string;
  readonly now: Date;
  readonly musicFetch: MusicFetchArtistResult | null;
  readonly reserved: boolean;
  readonly waitlistEntryId: string | null;
}): Promise<{
  profileId: string;
  handle: string;
  status: 'created' | 'updated';
}> {
  const cleanedProposedHandle = pickInitialProfileHandle(state.handle);
  let handle =
    cleanedProposedHandle ??
    (await reserveFallbackProfileHandle(state, cleanedProposedHandle, userId));

  for (let attempt = 0; attempt < HANDLE_CLAIM_MAX_ATTEMPTS; attempt++) {
    try {
      // Serialize this user's materialization even before a profile exists.
      // Avoid a users row lock: direct claims update profile -> users, and an
      // inverse users -> profile order would deadlock. External I/O stays out.
      const result = await withDbSessionTx(
        async tx => {
          // Match direct Spotify claims: identity lock before user/profile rows.
          if (state.artist)
            await lockSpotifyProfileIdentity(tx, state.artist.id);
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
          if (state.artist) {
            // A stale transcript must not replace an already bound identity.
            if (
              existingProfile?.spotifyId &&
              existingProfile.spotifyId !== state.artist.id
            ) {
              throw new SpotifyProfileIdentityConflictError();
            }
            await assertSpotifyProfileIdentityAvailable(
              tx,
              state.artist.id,
              existingProfile?.id ?? null
            );
          }
          return persistClaimedProfileRow({
            tx,
            userId,
            handle,
            existingProfile,
            displayName:
              state.artist?.name ?? existingProfile?.displayName ?? handle,
            settings: buildOnboardingSettings(
              existingProfile?.settings,
              state,
              conversationId,
              now
            ),
            now,
            spotifyFields: buildImportedProfileFields({
              existingProfile,
              state,
              musicFetch,
            }),
            reserved,
            waitlistEntryId,
          });
        },
        { clerkUserId: userId }
      );
      return { ...result, handle };
    } catch (error) {
      // Keep the unique constraint as a backstop for writers outside this lock.
      if (isUniqueViolation(error, 'creator_profiles_spotify_id_unique')) {
        throw new SpotifyProfileIdentityConflictError();
      }
      if (
        !isHandleUniqueViolation(error) ||
        attempt === HANDLE_CLAIM_MAX_ATTEMPTS - 1
      )
        throw error;
      // A failed transaction is rolled back before a handle retry starts.
      handle = await reserveFallbackProfileHandle(
        state,
        cleanedProposedHandle,
        userId
      );
    }
  }
  throw new Error('Failed to claim onboarding profile handle after retries');
}

export async function materializeClaimedOnboardingProfile({
  userId,
  conversationId,
  ipAddress,
  userAgent,
  visibility = 'public',
  waitlistEntryId = null,
}: MaterializeClaimedOnboardingProfileInput): Promise<MaterializeClaimedOnboardingProfileResult> {
  const reserved = visibility === 'reserved';
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

  const state = deriveClaimedOnboardingStateFromMessageRows(messageRows);
  if (!hasMaterializableState(state)) {
    return { profileId: null, handle: null, status: 'skipped' };
  }

  const now = new Date();
  const musicFetch = await fetchMusicFetchProfile(state);
  const { profileId, handle, status } =
    await persistClaimedProfileWithHandleRetry({
      userId: verifiedUserId,
      state,
      conversationId,
      now,
      musicFetch,
      reserved,
      waitlistEntryId,
    });

  // A reserved (waitlist-pending) profile only holds the handle. Publishing
  // ownership signals — activeProfileId and the owner claim row — happens on
  // the admitted claim path so nothing treats the reservation as admission.
  if (!reserved) {
    await db
      .update(users)
      .set({ activeProfileId: profileId, updatedAt: now })
      .where(eq(users.id, verifiedUserId));

    // "Manage as owner" claim row — only after verified ownership above.
    await db
      .insert(userProfileClaims)
      .values({
        userId: verifiedUserId,
        creatorProfileId: profileId,
        role: 'owner',
      })
      .onConflictDoNothing();
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

  const artistLabel = describeArtistProfileForVisitor({
    ownershipVerified: true,
    artistName: state.artist?.name ?? null,
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
      visibility: reserved ? 'reserved' : 'public',
      waitlistEntryId,
      spotifyArtistId: state.artist?.id ?? null,
      spotifyArtistName: state.artist?.name ?? null,
      // Neutral, ownership-verified label (never pre-verify "you" language).
      artistProfileLabel: artistLabel,
    },
    ipAddress,
    userAgent,
  });

  if (!reserved) {
    await recordFunnelStep({ funnel: 'artist_signup', step: 'claim_complete' });
  }

  return { profileId, handle, status };
}
