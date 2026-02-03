/**
 * Profile Database Operations
 *
 * Database operations for profile updates.
 */

import { NextResponse } from 'next/server';
import { db, eq } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { NO_STORE_HEADERS } from './constants';

export interface UpdateProfileRecordsParams {
  clerkUserId: string;
  dbProfileUpdates: Record<string, unknown>;
  displayNameForUserUpdate: string | undefined;
}

export async function updateProfileRecords({
  clerkUserId,
  dbProfileUpdates,
  displayNameForUserUpdate,
}: UpdateProfileRecordsParams): Promise<
  (typeof creatorProfiles)['$inferSelect'] | NextResponse
> {
  const user = await getUserByClerkId(db, clerkUserId);
  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const [updatedProfile] = await db
    .update(creatorProfiles)
    .set({ ...dbProfileUpdates, updatedAt: new Date() })
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

  return updatedProfile;
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
