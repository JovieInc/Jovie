import { neon } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { users } from '../lib/db/schema/auth';
import { discogReleases } from '../lib/db/schema/content';
import { creatorProfiles, userProfileClaims } from '../lib/db/schema/profiles';
import { waitlistEntries } from '../lib/db/schema/waitlist';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not configured');
}

const sql = neon(DATABASE_URL);
const db = drizzle(sql);
const SMOKE_PROFILE_USERNAME = 'native-auth-smoke-localhost';
const SMOKE_PROFILE_DISPLAY_NAME = 'Native Auth Smoke';
const SMOKE_RELEASE_SLUG = 'native-auth-smoke-release';
const SMOKE_RELEASE_TITLE = 'Native Auth Smoke Release';

function getRequiredArg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : '';
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function getOptionalArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : '';
  return value || null;
}

async function invalidateProxyUserState(clerkUserId: string): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  const redis = new Redis({ url, token });
  await Promise.all([
    redis.del(`proxy:user-state:${clerkUserId}`),
    redis.del(`proxy:user-state:stale:${clerkUserId}`),
  ]);
  return true;
}

async function ensureSmokeProfile(userId: string): Promise<string> {
  const now = new Date();
  const values = {
    userId,
    creatorType: 'artist' as const,
    username: SMOKE_PROFILE_USERNAME,
    usernameNormalized: SMOKE_PROFILE_USERNAME,
    displayName: SMOKE_PROFILE_DISPLAY_NAME,
    isPublic: true,
    isClaimed: true,
    claimedAt: now,
    onboardingCompletedAt: now,
    updatedAt: now,
  };

  const [existingProfile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, SMOKE_PROFILE_USERNAME))
    .limit(1);

  if (existingProfile) {
    await db
      .update(creatorProfiles)
      .set(values)
      .where(eq(creatorProfiles.id, existingProfile.id));
    return existingProfile.id;
  }

  const [createdProfile] = await db
    .insert(creatorProfiles)
    .values(values)
    .returning({ id: creatorProfiles.id });

  if (!createdProfile?.id) {
    throw new Error('Failed to create desktop smoke profile');
  }

  return createdProfile.id;
}

async function ensureSmokeProfileClaim(
  userId: string,
  creatorProfileId: string
): Promise<void> {
  const now = new Date();
  const [existingClaim] = await db
    .select({ id: userProfileClaims.id })
    .from(userProfileClaims)
    .where(
      and(
        eq(userProfileClaims.creatorProfileId, creatorProfileId),
        eq(userProfileClaims.role, 'owner')
      )
    )
    .limit(1);

  if (existingClaim) {
    await db
      .update(userProfileClaims)
      .set({ userId, claimedAt: now })
      .where(eq(userProfileClaims.id, existingClaim.id));
    return;
  }

  await db.insert(userProfileClaims).values({
    userId,
    creatorProfileId,
    role: 'owner',
    claimedAt: now,
  });
}

async function ensureSmokeRelease(creatorProfileId: string): Promise<string> {
  const now = new Date();
  const releaseDate = new Date('2026-06-01T00:00:00.000Z');
  const [release] = await db
    .insert(discogReleases)
    .values({
      creatorProfileId,
      title: SMOKE_RELEASE_TITLE,
      slug: SMOKE_RELEASE_SLUG,
      releaseType: 'single',
      releaseDate,
      status: 'released',
      totalTracks: 1,
      label: 'Jovie Smoke',
      distributor: 'Jovie',
      sourceType: 'manual',
      metadata: {
        desktopSmoke: true,
      },
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [discogReleases.creatorProfileId, discogReleases.slug],
      set: {
        title: SMOKE_RELEASE_TITLE,
        releaseType: 'single',
        releaseDate,
        status: 'released',
        deletedAt: null,
        totalTracks: 1,
        label: 'Jovie Smoke',
        distributor: 'Jovie',
        sourceType: 'manual',
        metadata: {
          desktopSmoke: true,
        },
        updatedAt: now,
      },
    })
    .returning({ id: discogReleases.id });

  if (!release?.id) {
    throw new Error('Failed to create desktop smoke release');
  }

  return release.id;
}

async function main() {
  const clerkUserId = getRequiredArg('--clerk-user-id');
  const email = getRequiredArg('--email');
  const entryId = getOptionalArg('--entry-id');
  const now = new Date();

  if (entryId) {
    const [entry] = await db
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.id, entryId))
      .limit(1);

    if (!entry) {
      throw new Error(`Waitlist entry not found: ${entryId}`);
    }

    await db
      .update(waitlistEntries)
      .set({
        status: 'approved',
        statusReason: 'desktop_smoke_local',
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(waitlistEntries.id, entryId));
  }

  const userUpdate = {
    userStatus: 'waitlist_approved' as const,
    ...(entryId ? { waitlistEntryId: entryId } : {}),
    updatedAt: now,
  };

  let updatedUsers = await db
    .update(users)
    .set(userUpdate)
    .where(eq(users.clerkId, clerkUserId))
    .returning({ id: users.id });

  if (updatedUsers.length === 0) {
    updatedUsers = await db
      .update(users)
      .set({
        ...userUpdate,
        clerkId: clerkUserId,
      })
      .where(eq(users.email, email))
      .returning({ id: users.id });
  }

  if (updatedUsers.length === 0) {
    updatedUsers = await db
      .insert(users)
      .values({
        clerkId: clerkUserId,
        email,
        userStatus: 'waitlist_approved',
        ...(entryId ? { waitlistEntryId: entryId } : {}),
      })
      .returning({ id: users.id });
  }

  if (updatedUsers.length === 0) {
    throw new Error(`User not found or created for Clerk id: ${clerkUserId}`);
  }

  const userId = updatedUsers[0]?.id;
  if (!userId) {
    throw new Error(`User id missing for Clerk id: ${clerkUserId}`);
  }

  const profileId = await ensureSmokeProfile(userId);
  await ensureSmokeProfileClaim(userId, profileId);
  const releaseId = await ensureSmokeRelease(profileId);

  await db
    .update(users)
    .set({
      userStatus: 'active',
      activeProfileId: profileId,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  const redisInvalidated = await invalidateProxyUserState(clerkUserId);

  console.log(
    JSON.stringify({
      ok: true,
      clerkUserId,
      email,
      entryId,
      userId,
      profileId,
      releaseId,
      redisInvalidated,
    })
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
