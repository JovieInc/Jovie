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
  type ClaimedOnboardingState,
  deriveClaimedOnboardingStateFromMessageRows,
} from '@/lib/onboarding/claimed-state';
import { reserveOnboardingHandle } from '@/lib/onboarding/reserved-handle';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

type CreatorProfile = typeof creatorProfiles.$inferSelect;

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

async function isHandleAvailableForProfile(
  handle: string,
  profileId: string | null
): Promise<boolean> {
  const [conflict] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, handle))
    .limit(1);

  return !conflict || conflict.id === profileId;
}

async function resolveProfileHandle({
  existingProfileId,
  proposedHandle,
  state,
}: {
  readonly existingProfileId: string | null;
  readonly proposedHandle: string | null;
  readonly state: ClaimedOnboardingState;
}): Promise<string> {
  const cleaned = cleanProposedHandle(proposedHandle);
  if (
    cleaned &&
    (await isHandleAvailableForProfile(cleaned, existingProfileId))
  ) {
    return cleaned;
  }

  return reserveOnboardingHandle(state.artist?.name ?? cleaned ?? 'artist');
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

export async function materializeClaimedOnboardingProfile({
  userId,
  conversationId,
  ipAddress,
  userAgent,
}: MaterializeClaimedOnboardingProfileInput): Promise<MaterializeClaimedOnboardingProfileResult> {
  const messageRows = await db
    .select({ toolCalls: chatMessages.toolCalls })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(chatMessages.createdAt);

  const state = deriveClaimedOnboardingStateFromMessageRows(messageRows);
  if (!hasMaterializableState(state)) {
    return { profileId: null, handle: null, status: 'skipped' };
  }

  const existingProfile = await fetchExistingProfile(userId);
  const handle = await resolveProfileHandle({
    existingProfileId: existingProfile?.id ?? null,
    proposedHandle: state.handle,
    state,
  });
  const now = new Date();
  const displayName =
    state.artist?.name ?? existingProfile?.displayName ?? handle;
  const settings = buildOnboardingSettings(
    existingProfile?.settings,
    state,
    conversationId,
    now
  );
  const spotifyFields = state.artist
    ? {
        avatarUrl:
          existingProfile?.avatarLockedByUser && existingProfile.avatarUrl
            ? existingProfile.avatarUrl
            : (state.artist.imageUrl ?? existingProfile?.avatarUrl ?? null),
        spotifyId: state.artist.id,
        spotifyUrl: state.artist.url,
        spotifyFollowers: state.artist.followers,
        spotifyPopularity: state.artist.popularity,
        genres: [...state.artist.genres],
      }
    : {};

  let profileId: string;
  let status: 'created' | 'updated';

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

    profileId = updated?.id ?? existingProfile.id;
    status = 'updated';
  } else {
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
    profileId = created.id;
    status = 'created';
  }

  await db
    .update(users)
    .set({ activeProfileId: profileId, updatedAt: now })
    .where(eq(users.id, userId));

  await db
    .insert(userProfileClaims)
    .values({
      userId,
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
        eq(chatConversations.userId, userId)
      )
    );

  await db.insert(chatAuditLog).values({
    userId,
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
    },
    ipAddress,
    userAgent,
  });

  return { profileId, handle, status };
}
