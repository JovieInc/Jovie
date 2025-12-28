import 'server-only';

import { clerkClient } from '@clerk/nextjs/server';
import { and, eq, isNull } from 'drizzle-orm';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateUsernameChange } from '@/lib/cache/profile';
import { creatorProfiles, users } from '@/lib/db/schema';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

export type UsernameValidationErrorCode = 'INVALID_USERNAME' | 'USERNAME_TAKEN';

export class UsernameValidationError extends Error {
  public readonly code: UsernameValidationErrorCode;

  constructor(code: UsernameValidationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

interface UsernameUpdateOutcome {
  normalized: string;
  changed: boolean;
  conflict: boolean;
  canonicalUsername: string;
}

async function updateCanonicalUsernameInternal(
  clerkUserId: string,
  rawUsername: string
): Promise<UsernameUpdateOutcome> {
  const validation = validateUsername(rawUsername);
  if (!validation.isValid) {
    throw new UsernameValidationError(
      'INVALID_USERNAME',
      validation.error ?? 'Invalid username'
    );
  }

  const normalized = normalizeUsername(rawUsername);

  return withDbSessionTx(
    async (tx, sessionClerkUserId) => {
      const effectiveClerkUserId = sessionClerkUserId;
      if (effectiveClerkUserId !== clerkUserId) {
        throw new Error('Clerk user mismatch while syncing username');
      }

      const [userRow] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, effectiveClerkUserId))
        .limit(1);

      if (!userRow) {
        throw new Error('User not found');
      }

      const [profile] = await tx
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, userRow.id))
        .limit(1);

      if (!profile) {
        throw new Error('Creator profile not found');
      }

      const canonicalUsername = profile.usernameNormalized;

      if (canonicalUsername === normalized) {
        return {
          normalized,
          changed: false,
          conflict: false,
          canonicalUsername,
        };
      }

      // Check for username conflicts, excluding soft-deleted profiles
      const [conflict] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(
          and(
            eq(creatorProfiles.usernameNormalized, normalized),
            isNull(creatorProfiles.deletedAt)
          )
        )
        .limit(1);

      if (conflict && conflict.id !== profile.id) {
        return {
          normalized,
          changed: false,
          conflict: true,
          canonicalUsername,
        };
      }

      await tx
        .update(creatorProfiles)
        .set({
          username: rawUsername,
          usernameNormalized: normalized,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.id, profile.id));

      return {
        normalized,
        changed: true,
        conflict: false,
        canonicalUsername: normalized,
      };
    },
    { clerkUserId }
  );
}

export async function syncCanonicalUsernameFromApp(
  clerkUserId: string,
  rawUsername: string
): Promise<void> {
  const outcome = await updateCanonicalUsernameInternal(
    clerkUserId,
    rawUsername
  );

  if (outcome.conflict) {
    throw new UsernameValidationError('USERNAME_TAKEN', 'Handle already taken');
  }

  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);

  const canonical = outcome.canonicalUsername;

  // Get old username from metadata for cache invalidation
  const oldUsername = (
    user.privateMetadata as { jovie_username_normalized?: string }
  )?.jovie_username_normalized;

  await client.users.updateUser(clerkUserId, {
    username: canonical,
    privateMetadata: {
      ...(user.privateMetadata as Record<string, unknown>),
      jovie_username_normalized: canonical,
    },
  });

  // Invalidate caches for both old and new usernames
  if (outcome.changed) {
    await invalidateUsernameChange(canonical, oldUsername);
  }
}

export async function syncUsernameFromClerkEvent(
  clerkUserId: string,
  rawUsername: string | null | undefined,
  privateMetadata: Record<string, unknown> | null | undefined
): Promise<void> {
  if (!rawUsername) {
    return;
  }

  const normalizedFromEvent = normalizeUsername(rawUsername);

  const metadata = (privateMetadata ?? {}) as {
    jovie_username_normalized?: string;
  };
  const metaNormalized = metadata.jovie_username_normalized;

  if (metaNormalized && metaNormalized === normalizedFromEvent) {
    return;
  }

  let outcome: UsernameUpdateOutcome;

  try {
    outcome = await updateCanonicalUsernameInternal(clerkUserId, rawUsername);
  } catch (error) {
    if (
      error instanceof UsernameValidationError &&
      error.code === 'INVALID_USERNAME'
    ) {
      if (metaNormalized) {
        const client = await clerkClient();
        await client.users.updateUser(clerkUserId, {
          username: metaNormalized,
        });
      }
      return;
    }
    throw error;
  }

  const client = await clerkClient();

  if (outcome.conflict) {
    await client.users.updateUser(clerkUserId, {
      username: outcome.canonicalUsername,
    });
    return;
  }

  const user = await client.users.getUser(clerkUserId);
  const canonical = outcome.canonicalUsername;

  await client.users.updateUser(clerkUserId, {
    username: canonical,
    privateMetadata: {
      ...(user.privateMetadata as Record<string, unknown>),
      jovie_username_normalized: canonical,
    },
  });
}
