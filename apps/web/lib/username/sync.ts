import 'server-only';

import { eq } from 'drizzle-orm';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateUsernameChange } from '@/lib/cache/profile';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
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

      const [conflict] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.usernameNormalized, normalized))
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

/**
 * Updates the canonical username in the database.
 *
 * NOTE: Usernames are stored ONLY in the database (creator_profiles table).
 * Clerk username field is NOT used - this eliminates sync overhead.
 *
 * @param clerkUserId - The Clerk user ID
 * @param rawUsername - The raw username input
 * @throws UsernameValidationError if username is invalid or taken
 */
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

  // Invalidate caches if username changed
  if (outcome.changed) {
    // Note: We don't have the old username without a Clerk lookup,
    // but invalidateUsernameChange handles undefined oldUsername gracefully
    await invalidateUsernameChange(outcome.canonicalUsername, undefined);
  }
}

/**
 * Handle username change events from Clerk webhook.
 *
 * NOTE: Usernames are now stored ONLY in the database.
 * Clerk username changes are IGNORED - users must change username via the app.
 * This function is kept for backwards compatibility but is a no-op.
 *
 * @deprecated Clerk username is no longer synced. Use app UI to change username.
 */
export async function syncUsernameFromClerkEvent(
  _clerkUserId: string,
  _rawUsername: string | null | undefined,
  _privateMetadata: Record<string, unknown> | null | undefined
): Promise<void> {
  // No-op: Usernames are stored only in the database.
  // Clerk username changes are ignored to eliminate sync overhead.
  // Users must change their username through the Jovie app.
  return;
}
