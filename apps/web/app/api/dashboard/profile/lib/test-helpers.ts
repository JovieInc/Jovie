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
}: TestProfileUpdateParams) {
  const existingProfileRecord = await getProfileByClerkId(clerkUserId);
  const existingProfile = existingProfileRecord?.profile ?? null;
  const usernameChanged =
    typeof usernameUpdate === 'string' &&
    usernameUpdate !== existingProfile?.username;

  if (usernameChanged) {
    await syncCanonicalUsernameFromApp(clerkUserId, usernameUpdate);
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
