import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { isHandleUniqueViolation } from '@/lib/errors/onboarding';
import { isContentClean } from '@/lib/validation/content-filter';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';
import { markWaitlistSignedUpInTx } from '@/lib/waitlist/signup';

export type MobileProfileCompletionErrorCode =
  | 'forbidden'
  | 'invalid_display_name'
  | 'invalid_handle'
  | 'handle_taken'
  | 'user_not_found';

export class MobileProfileCompletionError extends Error {
  constructor(
    readonly code: MobileProfileCompletionErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'MobileProfileCompletionError';
  }
}

export interface CompleteMobileProfileInput {
  readonly userId: string;
  readonly displayName: string;
  readonly username: string;
}

export interface CompleteMobileProfileResult {
  readonly displayName: string;
  readonly profileId: string;
  readonly username: string;
}

function validateInput(input: CompleteMobileProfileInput): {
  displayName: string;
  username: string;
} {
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 50 || !isContentClean(displayName)) {
    throw new MobileProfileCompletionError(
      'invalid_display_name',
      'Enter a display name using 50 characters or fewer.'
    );
  }

  const username = normalizeUsername(input.username.replace(/^@+/, ''));
  const validation = validateUsername(username);
  if (!validation.isValid) {
    throw new MobileProfileCompletionError(
      'invalid_handle',
      validation.error ?? 'Enter a valid handle.'
    );
  }

  return { displayName, username };
}

/**
 * Completes the minimum canonical creator profile for an already-provisioned
 * Better Auth app user. The caller supplies the app `users.id` resolved from
 * the validated native bearer session; no cookie or legacy Clerk identity is
 * consulted here.
 */
export async function completeMobileProfile(
  input: CompleteMobileProfileInput
): Promise<CompleteMobileProfileResult> {
  const validated = validateInput(input);
  let previousUsername: string | null = null;

  const result = await withDbSessionTx(
    async tx => {
      const [user] = await tx
        .select({
          activeProfileId: users.activeProfileId,
          id: users.id,
          userStatus: users.userStatus,
        })
        .from(users)
        .where(eq(users.id, input.userId))
        .for('update')
        .limit(1);

      if (!user) {
        throw new MobileProfileCompletionError(
          'user_not_found',
          'Your account could not be loaded.'
        );
      }
      if (
        user.userStatus === 'banned' ||
        user.userStatus === 'suspended' ||
        user.userStatus === 'waitlist_pending'
      ) {
        throw new MobileProfileCompletionError(
          'forbidden',
          'This account cannot complete profile setup.'
        );
      }

      const ownedProfiles = await tx
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, user.id))
        .orderBy(
          desc(creatorProfiles.isClaimed),
          desc(creatorProfiles.onboardingCompletedAt),
          desc(creatorProfiles.updatedAt)
        )
        .limit(10);

      const activeProfile = user.activeProfileId
        ? ownedProfiles.find(profile => profile.id === user.activeProfileId)
        : undefined;
      const existingProfile = activeProfile ?? ownedProfiles[0] ?? null;
      previousUsername = existingProfile?.usernameNormalized ?? null;

      const [conflict] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.usernameNormalized, validated.username))
        .limit(1);
      if (conflict && conflict.id !== existingProfile?.id) {
        throw new MobileProfileCompletionError(
          'handle_taken',
          'That handle is already taken.'
        );
      }

      const now = new Date();
      let profileId: string;

      if (existingProfile) {
        const [updated] = await tx
          .update(creatorProfiles)
          .set({
            claimedAt: existingProfile.claimedAt ?? now,
            displayName: validated.displayName,
            isClaimed: true,
            isPublic: true,
            onboardingCompletedAt: existingProfile.onboardingCompletedAt ?? now,
            updatedAt: now,
            username: validated.username,
            usernameNormalized: validated.username,
          })
          .where(eq(creatorProfiles.id, existingProfile.id))
          .returning({ id: creatorProfiles.id });
        profileId = updated?.id ?? existingProfile.id;
      } else {
        const [created] = await tx
          .insert(creatorProfiles)
          .values({
            claimedAt: now,
            creatorType: 'creator',
            displayName: validated.displayName,
            ingestionStatus: 'idle',
            isClaimed: true,
            isPublic: true,
            onboardingCompletedAt: now,
            settings: {},
            theme: {},
            userId: user.id,
            username: validated.username,
            usernameNormalized: validated.username,
          })
          .returning({ id: creatorProfiles.id });
        if (!created) {
          throw new Error('Failed to create mobile creator profile');
        }
        profileId = created.id;
      }

      await tx
        .insert(userProfileClaims)
        .values({
          creatorProfileId: profileId,
          role: 'owner',
          userId: user.id,
        })
        .onConflictDoNothing();

      await tx
        .update(users)
        .set({
          activeProfileId: profileId,
          userStatus: 'active',
          updatedAt: now,
        })
        .where(eq(users.id, user.id));

      await markWaitlistSignedUpInTx(tx, user.id);

      return {
        displayName: validated.displayName,
        profileId,
        username: validated.username,
      };
    },
    { clerkUserId: input.userId, isolationLevel: 'serializable' }
  ).catch(error => {
    if (isHandleUniqueViolation(error)) {
      throw new MobileProfileCompletionError(
        'handle_taken',
        'That handle is already taken.'
      );
    }
    throw error;
  });

  await Promise.allSettled([
    invalidateProxyUserStateCache(input.userId),
    invalidateProfileCache(previousUsername),
    invalidateProfileCache(result.username),
  ]);

  return result;
}
