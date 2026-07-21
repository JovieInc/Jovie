import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
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
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

type CreatorProfile = typeof creatorProfiles.$inferSelect;

const HANDLE_CLAIM_MAX_ATTEMPTS = 5;
const MAX_IMPORTED_BIO_LENGTH = 2_000;

export interface MaterializeClaimedOnboardingProfileInput {
  readonly userId: string;
  readonly conversationId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
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
  userId: string
): Promise<CreatorProfile | null> {
  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .orderBy(
      desc(creatorProfiles.isClaimed),
      desc(creatorProfiles.onboardingCompletedAt),
      desc(creatorProfiles.updatedAt)
    )
    .limit(1);

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

async function buildImportedProfileFields({
  existingProfile,
  state,
}: {
  readonly existingProfile: CreatorProfile | null;
  readonly state: ClaimedOnboardingState;
}): Promise<Record<string, unknown>> {
  if (!state.artist) return {};

  const musicFetch = await fetchMusicFetchProfile(state);
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
  readonly userId: string;
  readonly handle: string;
  readonly existingProfile: CreatorProfile | null;
  readonly displayName: string;
  readonly settings: Record<string, unknown>;
  readonly now: Date;
  readonly spotifyFields: Record<string, unknown>;
}

async function persistClaimedProfileRow({
  userId,
  handle,
  existingProfile,
  displayName,
  settings,
  now,
  spotifyFields,
}: PersistClaimedProfileInput): Promise<{
  profileId: string;
  status: 'created' | 'updated';
}> {
  if (existingProfile) {
    const [updated] = await db
      .update(creatorProfiles)
      .set({
        username: handle,
        usernameNormalized: handle,
        displayName:
          existingProfile.displayNameLocked && existingProfile.displayName
            ? existingProfile.displayName
            : displayName,
        isPublic: true,
        isClaimed: true,
        claimedAt: existingProfile.claimedAt ?? now,
        onboardingCompletedAt: existingProfile.onboardingCompletedAt ?? now,
        settings,
        updatedAt: now,
        ...spotifyFields,
      })
      .where(eq(creatorProfiles.id, existingProfile.id))
      .returning({ id: creatorProfiles.id });

    return {
      profileId: updated?.id ?? existingProfile.id,
      status: 'updated',
    };
  }

  const [created] = await db
    .insert(creatorProfiles)
    .values({
      userId,
      creatorType: 'artist',
      username: handle,
      usernameNormalized: handle,
      displayName,
      isPublic: true,
      isClaimed: true,
      claimedAt: now,
      onboardingCompletedAt: now,
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
  existingProfile,
  state,
  proposedHandle,
  settings,
  now,
  spotifyFields,
}: {
  readonly userId: string;
  readonly existingProfile: CreatorProfile | null;
  readonly state: ClaimedOnboardingState;
  readonly proposedHandle: string | null;
  readonly settings: Record<string, unknown>;
  readonly now: Date;
  readonly spotifyFields: Record<string, unknown>;
}): Promise<{
  profileId: string;
  handle: string;
  status: 'created' | 'updated';
}> {
  const cleanedProposedHandle = pickInitialProfileHandle(proposedHandle);
  let handle =
    cleanedProposedHandle ??
    (await reserveFallbackProfileHandle(state, cleanedProposedHandle, userId));

  for (let attempt = 0; attempt < HANDLE_CLAIM_MAX_ATTEMPTS; attempt++) {
    // Existing profiles may only be claimed/updated by their verified owner.
    // New profiles are created for this authenticated user (owner-to-be).
    if (existingProfile) {
      assertOnboardingProfileOwner({
        authenticatedUserId: userId,
        profileOwnerUserId: existingProfile.userId,
      });
    }

    const displayName =
      state.artist?.name ?? existingProfile?.displayName ?? handle;

    try {
      const result = await persistClaimedProfileRow({
        userId,
        handle,
        existingProfile,
        displayName,
        settings,
        now,
        spotifyFields,
      });

      return { ...result, handle };
    } catch (error) {
      if (
        !isHandleUniqueViolation(error) ||
        attempt === HANDLE_CLAIM_MAX_ATTEMPTS - 1
      ) {
        throw error;
      }

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
}: MaterializeClaimedOnboardingProfileInput): Promise<MaterializeClaimedOnboardingProfileResult> {
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

  const existingProfile = await fetchExistingProfile(verifiedUserId);
  if (existingProfile) {
    assertOnboardingProfileOwner({
      authenticatedUserId: verifiedUserId,
      profileOwnerUserId: existingProfile.userId,
    });
  }

  const now = new Date();
  const settings = buildOnboardingSettings(
    existingProfile?.settings,
    state,
    conversationId,
    now
  );
  const spotifyFields = await buildImportedProfileFields({
    existingProfile,
    state,
  });

  const { profileId, handle, status } =
    await persistClaimedProfileWithHandleRetry({
      userId: verifiedUserId,
      existingProfile,
      state,
      proposedHandle: state.handle,
      settings,
      now,
      spotifyFields,
    });

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

  await db
    .update(chatConversations)
    .set({ creatorProfileId: profileId, updatedAt: now })
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.userId, verifiedUserId)
      )
    );

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
      spotifyArtistId: state.artist?.id ?? null,
      spotifyArtistName: state.artist?.name ?? null,
      // Neutral, ownership-verified label (never pre-verify "you" language).
      artistProfileLabel: artistLabel,
    },
    ipAddress,
    userAgent,
  });

  return { profileId, handle, status };
}
