/**
 * Profile Database Operations
 *
 * Database operations for profile updates.
 */

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { mergeProfileTheme } from '@/lib/profile/profile-theme';
import { buildThemeWithProfileAccent } from '@/lib/profile/profile-theme.server';
import { NO_STORE_HEADERS } from './constants';

export interface UpdateProfileRecordsParams {
  clerkUserId: string;
  dbProfileUpdates: Record<string, unknown>;
  displayNameForUserUpdate: string | undefined;
  expectedVersion?: number;
}

export interface UpdateProfileRecordsResult {
  updatedProfile: (typeof creatorProfiles)['$inferSelect'];
  oldUsernameNormalized: string | null;
}

export async function updateProfileRecords({
  clerkUserId,
  dbProfileUpdates,
  displayNameForUserUpdate,
  expectedVersion,
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
      theme: creatorProfiles.theme,
      avatarUrl: creatorProfiles.avatarUrl,
      profileEditVersion: creatorProfiles.profileEditVersion,
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
          ...(existingProfile?.settings as Record<string, unknown> | null),
          ...(incomingSettings as Record<string, unknown>),
        }
      : undefined;

  const incomingTheme = dbProfileUpdates.theme;
  const mergedTheme =
    incomingTheme &&
    typeof incomingTheme === 'object' &&
    !Array.isArray(incomingTheme)
      ? mergeProfileTheme(
          existingProfile?.theme as Record<string, unknown> | null | undefined,
          incomingTheme as Record<string, unknown>
        )
      : undefined;

  const nextAvatarUrl =
    typeof dbProfileUpdates.avatarUrl === 'string' &&
    dbProfileUpdates.avatarUrl !== existingProfile?.avatarUrl
      ? dbProfileUpdates.avatarUrl
      : null;

  const finalTheme =
    nextAvatarUrl === null
      ? mergedTheme
      : await buildThemeWithProfileAccent({
          existingTheme:
            mergedTheme ??
            (existingProfile?.theme as
              | Record<string, unknown>
              | null
              | undefined),
          sourceUrl: nextAvatarUrl,
        });

  const finalProfileUpdates = {
    ...dbProfileUpdates,
    ...(mergedSettings === undefined ? {} : { settings: mergedSettings }),
    ...(finalTheme === undefined ? {} : { theme: finalTheme }),
  };

  const currentVersion = existingProfile?.profileEditVersion ?? 1;
  const compareVersion = expectedVersion ?? currentVersion;
  const [updatedProfile] = await db
    .update(creatorProfiles)
    .set({
      ...finalProfileUpdates,
      profileEditVersion: drizzleSql`${creatorProfiles.profileEditVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creatorProfiles.userId, user.id),
        eq(creatorProfiles.profileEditVersion, compareVersion)
      )
    )
    .returning();

  if (!updatedProfile) {
    if (existingProfile) {
      const [currentProfile] = await db
        .select({ profileEditVersion: creatorProfiles.profileEditVersion })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, user.id))
        .limit(1);
      return NextResponse.json(
        {
          error: 'Conflict: Profile has been modified by another request',
          code: 'VERSION_CONFLICT',
          currentVersion: currentProfile?.profileEditVersion,
          expectedVersion: compareVersion,
        },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Profile not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  if (displayNameForUserUpdate) {
    await db
      .update(users)
      .set({ name: displayNameForUserUpdate, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  return {
    updatedProfile,
    oldUsernameNormalized: existingProfile?.usernameNormalized ?? null,
  };
}

export async function getProfileByClerkId(clerkUserId: string) {
  const user = await getUserByClerkId(db, clerkUserId);
  if (!user) {
    return null;
  }

  const [userProfile] = await db
    .select({
      profile: creatorProfiles,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, user.id))
    .limit(1);

  return userProfile ?? null;
}
