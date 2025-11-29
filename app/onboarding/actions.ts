'use server';

import { auth } from '@clerk/nextjs/server';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { withDbSessionTx } from '@/lib/auth/session';
import { creatorProfiles, users } from '@/lib/db/schema';
import {
  createOnboardingError,
  OnboardingErrorCode,
} from '@/lib/errors/onboarding';
import { enforceOnboardingRateLimit } from '@/lib/onboarding/rate-limit';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

function profileIsPublishable(
  profile: typeof creatorProfiles.$inferSelect | null
) {
  if (!profile) return false;
  const hasHandle =
    Boolean(profile.username) && Boolean(profile.usernameNormalized);
  const hasName = Boolean(profile.displayName && profile.displayName.trim());
  const isPublic = profile.isPublic !== false;
  const hasCompleted = Boolean(profile.onboardingCompletedAt);

  return hasHandle && hasName && isPublic && hasCompleted;
}

export async function completeOnboarding({
  username,
  displayName,
  email,
  redirectToDashboard = true,
}: {
  username: string;
  displayName?: string;
  email?: string | null;
  redirectToDashboard?: boolean;
}) {
  try {
    // Step 1: Authentication check
    const { userId } = await auth();
    if (!userId) {
      const error = createOnboardingError(
        OnboardingErrorCode.NOT_AUTHENTICATED,
        'User not authenticated'
      );
      throw new Error(error.message);
    }

    // Step 2: Input validation
    const validation = validateUsername(username);
    if (!validation.isValid) {
      const error = createOnboardingError(
        OnboardingErrorCode.INVALID_USERNAME,
        validation.error || 'Invalid username'
      );
      throw new Error(error.message);
    }

    if (displayName && displayName.trim().length > 50) {
      const error = createOnboardingError(
        OnboardingErrorCode.DISPLAY_NAME_TOO_LONG,
        'Display name must be 50 characters or less'
      );
      throw new Error(error.message);
    }

    // Step 3: Rate limiting check
    const headersList = await headers();
    const clientIP = extractClientIP(headersList);

    // IMPORTANT: Always check IP-based rate limiting, even for 'unknown' IPs
    // The 'unknown' bucket acts as a shared rate limit to prevent abuse
    // from users behind proxies or with missing/invalid headers
    const shouldCheckIP = true;

    await enforceOnboardingRateLimit({
      userId,
      ip: clientIP,
      checkIP: shouldCheckIP,
    });

    // Step 4-6: Parallel operations for performance optimization
    const normalizedUsername = normalizeUsername(username);

    const trimmedDisplayName = displayName?.trim() || normalizedUsername;
    const userEmail = email ?? null;

    const completion = await withDbSessionTx(
      async (tx, clerkUserId: string) => {
        const ensureHandleAvailable = async (profileId?: string | null) => {
          const [conflict] = await tx
            .select({ id: creatorProfiles.id })
            .from(creatorProfiles)
            .where(eq(creatorProfiles.usernameNormalized, normalizedUsername))
            .limit(1);

          if (conflict && (!profileId || conflict.id !== profileId)) {
            const error = createOnboardingError(
              OnboardingErrorCode.USERNAME_TAKEN,
              'Handle already taken'
            );
            throw new Error(error.message);
          }
        };

        const [existingUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, clerkUserId))
          .limit(1);

        // If the user record does not exist, the stored function will create both user + profile
        if (!existingUser) {
          await ensureHandleAvailable(null);
          await tx.execute(
            drizzleSql`
              SELECT onboarding_create_profile(
                ${clerkUserId},
                ${userEmail ?? null},
                ${normalizedUsername},
                ${trimmedDisplayName}
              ) AS profile_id
            `
          );

          return { username: normalizedUsername, status: 'created' as const };
        }

        const [existingProfile] = await tx
          .select()
          .from(creatorProfiles)
          .where(eq(creatorProfiles.userId, existingUser.id))
          .limit(1);

        // If a profile already exists, ensure the handle is either the same or available
        const handleChanged =
          existingProfile?.usernameNormalized !== normalizedUsername;

        if (handleChanged) {
          await ensureHandleAvailable(existingProfile?.id);
        }

        const needsPublish = !profileIsPublishable(existingProfile);

        if (existingProfile && (needsPublish || handleChanged)) {
          const nextDisplayName =
            trimmedDisplayName || existingProfile.displayName || username;

          const [updated] = await tx
            .update(creatorProfiles)
            .set({
              username: normalizedUsername,
              usernameNormalized: normalizedUsername,
              displayName: nextDisplayName,
              onboardingCompletedAt:
                existingProfile.onboardingCompletedAt ?? new Date(),
              isPublic: true,
              updatedAt: new Date(),
            })
            .where(eq(creatorProfiles.id, existingProfile.id))
            .returning();

          return {
            username: updated?.usernameNormalized || normalizedUsername,
            status: 'updated' as const,
          };
        }

        if (existingProfile) {
          return {
            username: existingProfile.usernameNormalized,
            status: 'complete' as const,
          };
        }

        // Fallback: user exists but no profile yet
        await ensureHandleAvailable(null);
        await tx.execute(
          drizzleSql`
            SELECT onboarding_create_profile(
              ${clerkUserId},
              ${userEmail ?? null},
              ${normalizedUsername},
              ${trimmedDisplayName}
            ) AS profile_id
          `
        );
        return { username: normalizedUsername, status: 'created' as const };
      }
    );

    if (redirectToDashboard) {
      redirect('/dashboard/overview');
    }

    return completion;
  } catch (error) {
    console.error('🔴 ONBOARDING ERROR:', error);
    console.error(
      '🔴 ERROR STACK:',
      error instanceof Error ? error.stack : 'No stack available'
    );
    throw error;
  }
}
