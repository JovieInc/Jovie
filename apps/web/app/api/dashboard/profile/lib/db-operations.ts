/**
 * Profile Database Operations
 *
 * Database operations for profile updates.
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { NO_STORE_HEADERS } from './constants';

export interface UpdateProfileRecordsParams {
  clerkUserId: string;
  dbProfileUpdates: Record<string, unknown>;
  displayNameForUserUpdate: string | undefined;
}

export interface UpdateProfileRecordsResult {
  updatedProfile: (typeof creatorProfiles)['$inferSelect'];
  oldUsernameNormalized: string | null;
}

export async function updateProfileRecords({
  clerkUserId,
  dbProfileUpdates,
  displayNameForUserUpdate,
}: UpdateProfileRecordsParams): Promise<
  UpdateProfileRecordsResult | NextResponse
> {
  const user = await getUserByClerkId(db, clerkUserId);
  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const [existingProfile] = await db
    .select({
      usernameNormalized: creatorProfiles.usernameNormalized,
      settings: creatorProfiles.settings,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, user.id))
    .limit(1);

  const incomingSettings = dbProfileUpdates.settings;
  const mergedSettings =
    incomingSettings &&
    typeof incomingSettings === 'object' &&
    !Array.isArray(incomingSettings)
      ? {
          ...((existingProfile?.settings as Record<string, unknown> | null) ??
            {}),
          ...(incomingSettings as Record<string, unknown>),
        }
      : undefined;

  const finalProfileUpdates =
    mergedSettings !== undefined
      ? { ...dbProfileUpdates, settings: mergedSettings }
      : dbProfileUpdates;

  const [updatedProfile] = await db
    .update(creatorProfiles)
    .set({ ...finalProfileUpdates, updatedAt: new Date() })
    .where(eq(creatorProfiles.userId, user.id))
    .returning();

  if (displayNameForUserUpdate) {
    await db
      .update(users)
      .set({ name: displayNameForUserUpdate, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  if (!updatedProfile) {
    return NextResponse.json(
      { error: 'Profile not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  return {
    updatedProfile,
    oldUsernameNormalized: existingProfile?.usernameNormalized ?? null,
  };
}

export async function getProfileByClerkId(clerkUserId: string) {
  const [userProfile] = await db
    .select({
      profile: creatorProfiles,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  return userProfile ?? null;
}
