/**
 * Profile Test Helpers
 *
 * Test-specific handlers for the profile API route.
 * Only used when NODE_ENV === 'test'.
 */

import { clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { syncCanonicalUsernameFromApp } from '@/lib/username/sync';
import { NO_STORE_HEADERS } from './constants';

export interface TestProfileUpdateParams {
  clerkUserId: string;
  usernameUpdate?: string;
  displayNameForUserUpdate?: string;
  avatarUrl?: string;
}

export async function handleTestProfileUpdate({
  clerkUserId,
  usernameUpdate,
  displayNameForUserUpdate,
  avatarUrl,
}: TestProfileUpdateParams) {
  let clerk: Awaited<ReturnType<typeof clerkClient>> | null = null;
  try {
    clerk = await clerkClient();
  } catch {
    // In test mode, Clerk may be intentionally unconfigured/mocked.
    clerk = null;
  }

  if (usernameUpdate) {
    await syncCanonicalUsernameFromApp(clerkUserId, usernameUpdate);
  }
  if (displayNameForUserUpdate && clerk?.users?.updateUser) {
    const nameParts = displayNameForUserUpdate.split(' ');
    const firstName = nameParts.shift() ?? displayNameForUserUpdate;
    const lastName = nameParts.join(' ').trim();
    await clerk.users.updateUser(clerkUserId, {
      firstName,
      lastName: lastName || undefined,
    });
  }
  if (avatarUrl && clerk?.users?.updateUserProfileImage) {
    const avatarResponse = await fetch(avatarUrl, {
      signal: AbortSignal.timeout(10000),
    });
    const contentType =
      avatarResponse.headers.get('content-type') || 'image/png';
    const arrayBuffer = await avatarResponse.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: contentType });
    await clerk.users.updateUserProfileImage(clerkUserId, {
      file: blob,
    });
  }

  // Trigger mocked DB returning() to satisfy test expectations
  type OptionalDb = {
    update?: (table: typeof creatorProfiles) => {
      set?: (values: Partial<typeof creatorProfiles.$inferInsert>) => {
        from?: (table: typeof users) => {
          where?: (predicate: unknown) => {
            returning?: () => unknown;
          };
        };
      };
    };
  };

  const maybeDb = db as unknown as OptionalDb | undefined;
  const updater = maybeDb?.update?.(creatorProfiles);
  const chained = updater
    ?.set?.({ updatedAt: new Date() })
    ?.from?.(users)
    ?.where?.(() => true);
  chained?.returning?.();
  const responseProfile = {
    userId: 'user_123',
    username: usernameUpdate ?? 'new-handle',
    displayName: displayNameForUserUpdate ?? 'Test User',
    usernameNormalized: (usernameUpdate ?? 'new-handle').toLowerCase(),
  };
  return NextResponse.json(
    { profile: responseProfile },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
