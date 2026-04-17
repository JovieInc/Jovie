/**
 * Profile Test Helpers
 *
 * Test-specific handlers for the profile API route.
 * Only used when NODE_ENV === 'test'.
 */

import { clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { syncCanonicalUsernameFromApp } from '@/lib/username/sync';
import { NO_STORE_HEADERS } from './constants';
import { getProfileByClerkId, updateProfileRecords } from './db-operations';

export interface TestProfileUpdateParams {
  clerkUserId: string;
  dbProfileUpdates: Record<string, unknown>;
  usernameUpdate?: string;
  displayNameForUserUpdate?: string;
  avatarUrl?: string;
}

export async function handleTestProfileUpdate({
  clerkUserId,
  dbProfileUpdates,
  usernameUpdate,
  displayNameForUserUpdate,
  avatarUrl,
}: TestProfileUpdateParams) {
  const existingProfileRecord = await getProfileByClerkId(clerkUserId);
  const existingProfile = existingProfileRecord?.profile ?? null;
  const usernameChanged =
    typeof usernameUpdate === 'string' &&
    usernameUpdate !== existingProfile?.username;
  const displayNameChanged =
    typeof displayNameForUserUpdate === 'string' &&
    displayNameForUserUpdate !== existingProfile?.displayName;
  const avatarChanged =
    typeof avatarUrl === 'string' && avatarUrl !== existingProfile?.avatarUrl;

  let clerk: Awaited<ReturnType<typeof clerkClient>> | null = null;
  try {
    clerk = await clerkClient();
  } catch {
    // In test mode, Clerk may be intentionally unconfigured/mocked.
    clerk = null;
  }

  if (usernameChanged) {
    await syncCanonicalUsernameFromApp(clerkUserId, usernameUpdate);
  }
  if (displayNameChanged && clerk?.users?.updateUser) {
    const nameParts = displayNameForUserUpdate.split(' ');
    const firstName = nameParts.shift() ?? displayNameForUserUpdate;
    const lastName = nameParts.join(' ').trim();
    await clerk.users.updateUser(clerkUserId, {
      firstName,
      lastName: lastName || undefined,
    });
  }
  if (avatarChanged && clerk?.users?.updateUserProfileImage) {
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

  const updateResult = await updateProfileRecords({
    clerkUserId,
    dbProfileUpdates,
    displayNameForUserUpdate,
  });

  if (updateResult instanceof NextResponse) {
    return updateResult;
  }

  const responseProfile = {
    userId: updateResult.updatedProfile.userId,
    username: updateResult.updatedProfile.username,
    displayName: updateResult.updatedProfile.displayName,
    usernameNormalized: updateResult.updatedProfile.usernameNormalized,
  };
  return NextResponse.json(
    { profile: responseProfile },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
