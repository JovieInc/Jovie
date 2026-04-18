import { eq, inArray } from 'drizzle-orm';
/* eslint-disable no-restricted-imports -- Integration test requires full schema access */
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createProfileForExistingUser,
  deactivateOrphanedProfiles,
  updateExistingProfile,
} from '@/app/onboarding/actions/profile-setup';
import * as schema from '@/lib/db/schema';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { setupDatabaseBeforeAll } from '../setup-db';

type TestDb = NeonDatabase<typeof schema>;

setupDatabaseBeforeAll();

let db: TestDb;
const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];

beforeAll(() => {
  const connection = (globalThis as typeof globalThis & { db?: TestDb }).db;
  if (!connection) {
    throw new Error(
      'Database connection not initialized for onboarding completion integration tests'
    );
  }

  db = connection;
});

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await db
      .update(users)
      .set({ activeProfileId: null })
      .where(inArray(users.id, createdUserIds));
  }

  if (createdProfileIds.length > 0) {
    await db
      .delete(userProfileClaims)
      .where(inArray(userProfileClaims.creatorProfileId, createdProfileIds));

    await db
      .delete(creatorProfiles)
      .where(inArray(creatorProfiles.id, createdProfileIds));
  }

  if (createdUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }

  createdProfileIds.length = 0;
  createdUserIds.length = 0;
});

describe('onboarding completion persistence (integration)', () => {
  it('creates a claimed public profile, sets activeProfileId, and records ownership', async () => {
    const suffix = Date.now().toString(36);
    const [user] = await db
      .insert(users)
      .values({
        clerkId: `integration_create_${suffix}`,
        email: `integration-create-${suffix}@example.com`,
        userStatus: 'active',
      })
      .returning({ id: users.id });
    createdUserIds.push(user.id);

    const result = await db.transaction(tx =>
      createProfileForExistingUser(
        tx,
        user.id,
        `artist-${suffix}`,
        'Integration Artist'
      )
    );

    expect(result.status).toBe('created');
    expect(result.profileId).toBeTruthy();
    createdProfileIds.push(result.profileId!);

    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        isClaimed: creatorProfiles.isClaimed,
        isPublic: creatorProfiles.isPublic,
        onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, result.profileId!));

    const [updatedUser] = await db
      .select({ activeProfileId: users.activeProfileId })
      .from(users)
      .where(eq(users.id, user.id));

    const [claim] = await db
      .select({
        creatorProfileId: userProfileClaims.creatorProfileId,
        userId: userProfileClaims.userId,
        role: userProfileClaims.role,
      })
      .from(userProfileClaims)
      .where(eq(userProfileClaims.creatorProfileId, result.profileId!));

    expect(profile).toEqual(
      expect.objectContaining({
        id: result.profileId,
        isClaimed: true,
        isPublic: true,
        usernameNormalized: `artist-${suffix}`,
      })
    );
    expect(profile?.onboardingCompletedAt).toBeTruthy();
    expect(updatedUser?.activeProfileId).toBe(result.profileId);
    expect(claim).toEqual(
      expect.objectContaining({
        creatorProfileId: result.profileId,
        userId: user.id,
        role: 'owner',
      })
    );
  }, 20_000);

  it('updates the active profile and deactivates orphaned unclaimed profiles', async () => {
    const suffix = `${Date.now().toString(36)}-update`;
    const [user] = await db
      .insert(users)
      .values({
        clerkId: `integration_update_${suffix}`,
        email: `integration-update-${suffix}@example.com`,
        userStatus: 'active',
      })
      .returning({ id: users.id });
    createdUserIds.push(user.id);

    const [currentProfile, orphanedProfile] = await db
      .insert(creatorProfiles)
      .values([
        {
          userId: user.id,
          creatorType: 'artist',
          username: `draft-${suffix}`,
          usernameNormalized: `draft-${suffix}`,
          displayName: 'Draft Artist',
          isPublic: false,
          isClaimed: false,
          onboardingCompletedAt: null,
        },
        {
          userId: user.id,
          creatorType: 'artist',
          username: `stale-${suffix}`,
          usernameNormalized: `stale-${suffix}`,
          displayName: 'Stale Artist',
          isPublic: true,
          isClaimed: false,
          onboardingCompletedAt: null,
        },
      ])
      .returning({
        id: creatorProfiles.id,
        userId: creatorProfiles.userId,
        username: creatorProfiles.username,
        usernameNormalized: creatorProfiles.usernameNormalized,
        displayName: creatorProfiles.displayName,
        isPublic: creatorProfiles.isPublic,
        isClaimed: creatorProfiles.isClaimed,
        claimedAt: creatorProfiles.claimedAt,
        onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
      });
    createdProfileIds.push(currentProfile.id, orphanedProfile.id);

    const result = await db.transaction(async tx => {
      const updated = await updateExistingProfile(
        tx,
        currentProfile,
        `claimed-${suffix}`,
        'Claimed Artist',
        `claimed-${suffix}`
      );
      await deactivateOrphanedProfiles(tx, user.id, currentProfile.id);
      return updated;
    });

    expect(result).toEqual({
      username: `claimed-${suffix}`,
      status: 'updated',
      profileId: currentProfile.id,
    });

    const [updatedCurrent] = await db
      .select({
        usernameNormalized: creatorProfiles.usernameNormalized,
        displayName: creatorProfiles.displayName,
        isClaimed: creatorProfiles.isClaimed,
        isPublic: creatorProfiles.isPublic,
        onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, currentProfile.id));

    const [updatedOrphan] = await db
      .select({ isPublic: creatorProfiles.isPublic })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, orphanedProfile.id));

    const [updatedUser] = await db
      .select({ activeProfileId: users.activeProfileId })
      .from(users)
      .where(eq(users.id, user.id));

    expect(updatedCurrent).toEqual(
      expect.objectContaining({
        usernameNormalized: `claimed-${suffix}`,
        displayName: 'Claimed Artist',
        isClaimed: true,
        isPublic: true,
      })
    );
    expect(updatedCurrent?.onboardingCompletedAt).toBeTruthy();
    expect(updatedOrphan?.isPublic).toBe(false);
    expect(updatedUser?.activeProfileId).toBe(currentProfile.id);
  }, 20_000);
});
