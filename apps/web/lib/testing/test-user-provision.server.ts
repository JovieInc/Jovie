import { createClerkClient } from '@clerk/backend';
import { Redis } from '@upstash/redis';
import { and, eq, or } from 'drizzle-orm';
import { CACHE_TAGS } from '@/lib/cache/tags';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { normalizeEmail } from '@/lib/utils/email';

export const DEFAULT_TEST_AVATAR_URL = '/avatars/default-user.png';

const TEST_ACCOUNT_EMAIL_REGEX =
  /^(?:e2e(?:-[a-z0-9]+)?|browse(?:-[a-z0-9]+)?)(?:\+clerk_test)?@jov\.ie$/i;
const PRIVILEGED_TEST_ACCOUNT_EMAIL_REGEX =
  /^e2e(?:-[a-z0-9]+)?(?:\+clerk_test)?@jov\.ie$/i;

type SeededUserValues = Pick<
  typeof users.$inferInsert,
  | 'clerkId'
  | 'email'
  | 'name'
  | 'userStatus'
  | 'isAdmin'
  | 'plan'
  | 'isPro'
  | 'billingUpdatedAt'
>;

type SeededCreatorProfileValues = Pick<
  typeof creatorProfiles.$inferInsert,
  | 'userId'
  | 'creatorType'
  | 'username'
  | 'usernameNormalized'
  | 'displayName'
  | 'bio'
  | 'venmoHandle'
  | 'avatarUrl'
  | 'spotifyUrl'
  | 'appleMusicUrl'
  | 'appleMusicId'
  | 'youtubeMusicId'
  | 'deezerId'
  | 'tidalId'
  | 'soundcloudId'
  | 'isPublic'
  | 'isVerified'
  | 'isClaimed'
  | 'ingestionStatus'
  | 'onboardingCompletedAt'
>;

type SeededSocialLinkValues = Pick<
  typeof socialLinks.$inferInsert,
  | 'creatorProfileId'
  | 'platform'
  | 'platformType'
  | 'url'
  | 'displayText'
  | 'isActive'
  | 'sortOrder'
  | 'state'
>;

interface MatchedSeedUser {
  readonly id: string;
  readonly clerkId: string | null;
  readonly email: string | null;
}

interface EnsureClerkTestUserOptions {
  readonly email: string;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fallbackClerkId?: string;
  readonly metadata?: Record<string, string>;
}

function isDuplicateKeyError(
  error: unknown,
  seen = new Set<unknown>()
): boolean {
  if (!error || (typeof error !== 'object' && !(error instanceof Error))) {
    return String(error).includes('duplicate key value');
  }

  if (seen.has(error)) {
    return false;
  }
  seen.add(error);

  const candidate = error as {
    readonly cause?: unknown;
    readonly code?: string;
    readonly message?: string;
  };

  if (candidate.code === '23505') {
    return true;
  }

  if (typeof candidate.message === 'string') {
    if (candidate.message.includes('duplicate key value')) {
      return true;
    }
  }

  return isDuplicateKeyError(candidate.cause, seen);
}

function isClerkIdentificationExistsError(error: unknown): boolean {
  if (
    error instanceof Error &&
    error.message.includes('IdentificationExists')
  ) {
    return true;
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    readonly status?: number;
    readonly errors?: ReadonlyArray<{ readonly code?: string }>;
  };

  return (
    candidate.status === 422 ||
    Boolean(
      candidate.errors?.some(
        ({ code }) => typeof code === 'string' && code.includes('identifier')
      )
    )
  );
}

function isClerkUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    readonly status?: number;
    readonly errors?: ReadonlyArray<{ readonly code?: string }>;
  };

  return (
    candidate.status === 401 ||
    candidate.status === 403 ||
    Boolean(
      candidate.errors?.some(
        ({ code }) =>
          code === 'unauthorized' || code === 'authentication_invalid'
      )
    )
  );
}

export function isAllowlistedTestAccountEmail(
  email: string | null | undefined
): email is string {
  return (
    typeof email === 'string' &&
    TEST_ACCOUNT_EMAIL_REGEX.test(normalizeEmail(email))
  );
}

export function isAllowlistedPrivilegedTestAccountEmail(
  email: string | null | undefined
): email is string {
  return (
    typeof email === 'string' &&
    PRIVILEGED_TEST_ACCOUNT_EMAIL_REGEX.test(normalizeEmail(email))
  );
}

export function getDeterministicTestClerkId(email: string): string {
  const normalizedEmail = normalizeEmail(email);
  const stableId = normalizedEmail.replaceAll(/[^a-z0-9]+/gi, '_').slice(0, 48);
  return `user_dev_${stableId || 'browse'}`;
}

function resolveMatchedSeedUser(
  matchedUsers: readonly MatchedSeedUser[],
  values: SeededUserValues
): MatchedSeedUser | undefined {
  const normalizedEmail = values.email ? normalizeEmail(values.email) : null;
  const clerkIdMatches = matchedUsers.filter(
    matchedUser => matchedUser.clerkId === values.clerkId
  );
  const emailMatches = normalizedEmail
    ? matchedUsers.filter(matchedUser => matchedUser.email === normalizedEmail)
    : [];

  if (clerkIdMatches.length > 1 || emailMatches.length > 1) {
    throw new Error(
      `Ambiguous test user match for ${values.email ?? 'unknown email'}`
    );
  }

  const clerkIdMatch = clerkIdMatches[0];
  const emailMatch = emailMatches[0];

  if (clerkIdMatch && emailMatch && clerkIdMatch.id !== emailMatch.id) {
    throw new Error(
      `Conflicting test user matches for ${values.email ?? 'unknown email'}`
    );
  }

  return clerkIdMatch ?? emailMatch ?? matchedUsers[0];
}

function buildSeedUserLookupCondition(values: SeededUserValues) {
  const normalizedEmail = values.email ? normalizeEmail(values.email) : null;
  const emailAdoptionAllowed = isAllowlistedTestAccountEmail(normalizedEmail);

  const userLookupCondition =
    emailAdoptionAllowed && normalizedEmail
      ? or(eq(users.clerkId, values.clerkId), eq(users.email, normalizedEmail))
      : eq(users.clerkId, values.clerkId);

  return {
    emailAdoptionAllowed,
    normalizedEmail,
    userLookupCondition,
  };
}

export async function resolveClerkTestUserId(
  email: string,
  fallbackClerkId?: string
): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!normalizedEmail) {
    return fallbackClerkId ?? getDeterministicTestClerkId(email);
  }

  if (!secretKey?.startsWith('sk_test_')) {
    return fallbackClerkId ?? getDeterministicTestClerkId(normalizedEmail);
  }

  if (!isAllowlistedTestAccountEmail(normalizedEmail)) {
    return fallbackClerkId ?? getDeterministicTestClerkId(normalizedEmail);
  }

  const clerk = createClerkClient({ secretKey });
  let existingUsers;
  try {
    existingUsers = await clerk.users.getUserList({
      emailAddress: [normalizedEmail],
    });
  } catch (error) {
    if (isClerkUnauthorizedError(error) && fallbackClerkId) {
      return fallbackClerkId;
    }
    throw error;
  }

  return (
    existingUsers.data[0]?.id ??
    fallbackClerkId ??
    getDeterministicTestClerkId(normalizedEmail)
  );
}

export async function ensureClerkTestUser({
  email,
  username,
  firstName,
  lastName,
  fallbackClerkId,
  metadata,
}: EnsureClerkTestUserOptions): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey?.startsWith('sk_test_')) {
    return fallbackClerkId ?? getDeterministicTestClerkId(normalizedEmail);
  }

  if (!isAllowlistedTestAccountEmail(normalizedEmail)) {
    return fallbackClerkId ?? getDeterministicTestClerkId(normalizedEmail);
  }

  const clerk = createClerkClient({ secretKey });
  let existingUser: { id: string } | undefined;
  try {
    const existingUsers = await clerk.users.getUserList({
      emailAddress: [normalizedEmail],
    });
    existingUser = existingUsers.data[0];
  } catch (error) {
    if (isClerkUnauthorizedError(error) && fallbackClerkId) {
      return fallbackClerkId;
    }
    throw error;
  }

  if (existingUser) {
    return existingUser.id;
  }

  try {
    const createdUser = await clerk.users.createUser({
      username,
      emailAddress: [normalizedEmail],
      firstName,
      lastName,
      publicMetadata: metadata,
      skipPasswordRequirement: true,
    });

    return createdUser.id;
  } catch (error) {
    if (isClerkUnauthorizedError(error) && fallbackClerkId) {
      return fallbackClerkId;
    }

    if (!isClerkIdentificationExistsError(error)) {
      throw error;
    }

    return resolveRacedClerkUser(
      clerk,
      normalizedEmail,
      fallbackClerkId,
      error
    );
  }
}

async function resolveRacedClerkUser(
  clerk: ReturnType<typeof createClerkClient>,
  normalizedEmail: string,
  fallbackClerkId: string | undefined,
  originalError: unknown
): Promise<string> {
  let racedUser: { id: string } | undefined;
  try {
    const racedUsers = await clerk.users.getUserList({
      emailAddress: [normalizedEmail],
    });
    racedUser = racedUsers.data[0];
  } catch (raceError) {
    if (isClerkUnauthorizedError(raceError) && fallbackClerkId) {
      return fallbackClerkId;
    }
    throw raceError;
  }

  if (!racedUser) {
    throw originalError;
  }

  return racedUser.id;
}

export async function ensureUserRecord(
  database: DbOrTransaction,
  values: SeededUserValues
) {
  const { normalizedEmail, userLookupCondition } =
    buildSeedUserLookupCondition(values);

  const matchedUsers = await database
    .select({ id: users.id, clerkId: users.clerkId, email: users.email })
    .from(users)
    .where(userLookupCondition);
  const existingUser = resolveMatchedSeedUser(matchedUsers, values);

  const normalizedValues = {
    ...values,
    email: normalizedEmail,
  };

  if (existingUser) {
    await database
      .update(users)
      .set({ ...normalizedValues, updatedAt: new Date() })
      .where(eq(users.id, existingUser.id));

    return {
      id: existingUser.id,
      previousClerkId:
        existingUser.clerkId === normalizedValues.clerkId
          ? null
          : existingUser.clerkId,
    };
  }

  try {
    const [createdUser] = await database
      .insert(users)
      .values(normalizedValues)
      .returning({ id: users.id });

    return {
      id: createdUser.id,
      previousClerkId: null,
    };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const racedUsers = await database
      .select({ id: users.id, clerkId: users.clerkId, email: users.email })
      .from(users)
      .where(userLookupCondition);
    const racedUser = resolveMatchedSeedUser(racedUsers, normalizedValues);

    if (!racedUser) {
      throw error;
    }

    await database
      .update(users)
      .set({ ...normalizedValues, updatedAt: new Date() })
      .where(eq(users.id, racedUser.id));

    return {
      id: racedUser.id,
      previousClerkId:
        racedUser.clerkId === normalizedValues.clerkId
          ? null
          : racedUser.clerkId,
    };
  }
}

export async function ensureCreatorProfileRecord(
  database: DbOrTransaction,
  values: SeededCreatorProfileValues
): Promise<string> {
  function resolveExistingProfileMatch(
    existingProfileByUsername:
      | {
          id: string;
          userId: string | null;
          isClaimed: boolean | null;
        }
      | undefined,
    existingClaimedProfileForUser:
      | {
          id: string;
        }
      | undefined
  ) {
    if (
      existingProfileByUsername &&
      existingClaimedProfileForUser &&
      existingProfileByUsername.id !== existingClaimedProfileForUser.id
    ) {
      throw new Error(
        `Conflicting creator profile matches for ${values.usernameNormalized} and user ${values.userId}`
      );
    }

    if (existingClaimedProfileForUser) {
      return existingClaimedProfileForUser;
    }

    if (
      existingProfileByUsername &&
      values.userId &&
      existingProfileByUsername.userId &&
      existingProfileByUsername.userId !== values.userId
    ) {
      throw new Error(
        `Conflicting creator profile matches for ${values.usernameNormalized} and user ${values.userId}`
      );
    }

    return existingProfileByUsername;
  }

  const [existingProfileByUsername] = await database
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      isClaimed: creatorProfiles.isClaimed,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, values.usernameNormalized))
    .limit(1);

  const existingClaimedProfilesForUser =
    values.userId && values.isClaimed
      ? await database
          .select({ id: creatorProfiles.id })
          .from(creatorProfiles)
          .where(
            and(
              eq(creatorProfiles.userId, values.userId),
              eq(creatorProfiles.isClaimed, true)
            )
          )
          .limit(2)
      : [];

  if (existingClaimedProfilesForUser.length > 1) {
    throw new Error(
      `Ambiguous claimed creator profiles for user ${values.userId}`
    );
  }

  const existingClaimedProfileForUser = existingClaimedProfilesForUser[0];
  const existingProfile = resolveExistingProfileMatch(
    existingProfileByUsername,
    existingClaimedProfileForUser
  );

  if (existingProfile) {
    await database
      .update(creatorProfiles)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(creatorProfiles.id, existingProfile.id));
    return existingProfile.id;
  }

  try {
    const [createdProfile] = await database
      .insert(creatorProfiles)
      .values(values)
      .returning({ id: creatorProfiles.id });
    return createdProfile.id;
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const [racedProfileByUsername] = await database
      .select({
        id: creatorProfiles.id,
        userId: creatorProfiles.userId,
        isClaimed: creatorProfiles.isClaimed,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, values.usernameNormalized))
      .limit(1);

    const racedClaimedProfilesForUser =
      values.userId && values.isClaimed
        ? await database
            .select({ id: creatorProfiles.id })
            .from(creatorProfiles)
            .where(
              and(
                eq(creatorProfiles.userId, values.userId),
                eq(creatorProfiles.isClaimed, true)
              )
            )
            .limit(2)
        : [];

    if (racedClaimedProfilesForUser.length > 1) {
      throw new Error(
        `Ambiguous claimed creator profiles for user ${values.userId}`
      );
    }

    const racedClaimedProfileForUser = racedClaimedProfilesForUser[0];
    const racedProfile = resolveExistingProfileMatch(
      racedProfileByUsername,
      racedClaimedProfileForUser
    );

    if (!racedProfile) {
      throw error;
    }

    await database
      .update(creatorProfiles)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(creatorProfiles.id, racedProfile.id));

    return racedProfile.id;
  }
}

export async function ensureUserProfileClaim(
  database: DbOrTransaction,
  userId: string,
  creatorProfileId: string
): Promise<void> {
  const [existingClaim] = await database
    .select({
      id: userProfileClaims.id,
      userId: userProfileClaims.userId,
    })
    .from(userProfileClaims)
    .where(eq(userProfileClaims.creatorProfileId, creatorProfileId))
    .limit(1);

  if (existingClaim) {
    await database
      .update(userProfileClaims)
      .set({ userId, role: 'owner', claimedAt: new Date() })
      .where(eq(userProfileClaims.id, existingClaim.id));
    return;
  }

  try {
    await database.insert(userProfileClaims).values({
      userId,
      creatorProfileId,
      role: 'owner',
      claimedAt: new Date(),
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const [racedClaim] = await database
      .select({ id: userProfileClaims.id })
      .from(userProfileClaims)
      .where(eq(userProfileClaims.creatorProfileId, creatorProfileId))
      .limit(1);

    if (!racedClaim) {
      throw error;
    }

    await database
      .update(userProfileClaims)
      .set({ userId, role: 'owner', claimedAt: new Date() })
      .where(eq(userProfileClaims.id, racedClaim.id));
  }
}

export async function setActiveProfileForUser(
  database: DbOrTransaction,
  userId: string,
  profileId: string
): Promise<void> {
  const [updatedUser] = await database
    .update(users)
    .set({
      activeProfileId: profileId,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (!updatedUser) {
    throw new Error(
      `Failed to set active profile ${profileId} for test user ${userId}`
    );
  }
}

export async function ensureSocialLinkRecord(
  database: DbOrTransaction,
  values: SeededSocialLinkValues
): Promise<void> {
  const [existingLink] = await database
    .select({ id: socialLinks.id })
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, values.creatorProfileId),
        eq(socialLinks.platform, values.platform)
      )
    )
    .limit(1);

  if (existingLink) {
    await database
      .update(socialLinks)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(socialLinks.id, existingLink.id));
    return;
  }

  try {
    await database.insert(socialLinks).values(values);
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const [racedLink] = await database
      .select({ id: socialLinks.id })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, values.creatorProfileId),
          eq(socialLinks.platform, values.platform)
        )
      )
      .limit(1);

    if (!racedLink) {
      throw error;
    }

    await database
      .update(socialLinks)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(socialLinks.id, racedLink.id));
  }
}

export async function invalidateTestUserCaches(
  clerkIds: readonly string[]
): Promise<void> {
  if (clerkIds.length === 0) {
    return;
  }

  // Keep seed helpers importable from plain tsx/Node entrypoints used by
  // Playwright global setup. These server-only modules are only needed here.
  const [{ revalidateTag }, { invalidateProxyUserStateCache }] =
    await Promise.all([import('next/cache'), import('@/lib/auth/proxy-state')]);

  for (const clerkId of clerkIds) {
    await invalidateProxyUserStateCache(clerkId);
  }

  try {
    revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');
  } catch (error) {
    // Playwright global setup seeds data from plain Node.js, where Next's
    // static generation store is unavailable. Fail open for that test-only path.
    if (
      !(error instanceof Error) ||
      !error.message.includes('static generation store missing')
    ) {
      throw error;
    }
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return;
  }

  const redis = new Redis({ url, token });

  for (const clerkId of clerkIds) {
    await redis.del(`admin:role:${clerkId}`);
  }
}
