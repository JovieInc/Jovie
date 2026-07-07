import { Redis } from '@upstash/redis';
import { and, eq, or } from 'drizzle-orm';
import { CACHE_TAGS } from '@/lib/cache/tags';
import type { DbOrTransaction } from '@/lib/db';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { baUsers } from '@/lib/db/schema/better-auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { normalizeEmail } from '@/lib/utils/email';

export const DEFAULT_TEST_AVATAR_URL = '/avatars/default-user.png';

/**
 * Lazy Clerk client factory (Clerk → Better Auth migration, commit ⑨).
 * The dev bypass path no longer calls Clerk — `ensureBetterAuthTestUser`
 * does direct drizzle upserts. But the legacy `ensureClerkTestUser` /
 * `ensureLiveClerkTestUser` functions are still used by standalone scripts
 * (`scripts/setup-e2e-users.ts`, `scripts/cleanup-e2e-users.ts`). The
 * dynamic import keeps `@clerk/backend` out of the module-level import
 * graph so the dev bypass hot path never loads Clerk code.
 */
async function lazyCreateClerkClient(opts: { secretKey: string }) {
  const { createClerkClient } = await import('@clerk/backend');
  return createClerkClient(opts);
}

type ClerkClient = Awaited<ReturnType<typeof lazyCreateClerkClient>>;

const TEST_ACCOUNT_EMAIL_REGEX =
  /^(?:e2e(?:-[a-z0-9]+)?|browse(?:-[a-z0-9]+)?)(?:\+clerk_test)?@jov\.ie$/i;
const PRIVILEGED_TEST_ACCOUNT_EMAIL_REGEX =
  /^e2e(?:-[a-z0-9]+)?(?:\+clerk_test)?@jov\.ie$/i;

type SeededUserValues = Pick<
  typeof users.$inferInsert,
  | 'email'
  | 'name'
  | 'userStatus'
  | 'isAdmin'
  | 'plan'
  | 'isPro'
  | 'billingUpdatedAt'
  | 'betterAuthUserId'
> & {
  // clerk_id is nullable in the schema as of migration 0073; the dev/E2E
  // seed path always carries a stable Clerk id, so narrow it back to string.
  clerkId: string;
};

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

interface ResolvedSeedUserMatch {
  readonly user: MatchedSeedUser | undefined;
  readonly staleClerkIdUsers: readonly MatchedSeedUser[];
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

/**
 * Deterministic Better Auth user id for dev/E2E test users (Clerk → Better
 * Auth migration, plan decision 10 / commit ⑨). Replaces the Clerk-era
 * `getDeterministicTestClerkId` for the BA path. The id is stable per email
 * so re-running `ensureBetterAuthTestUser` is idempotent.
 */
export function getDeterministicTestBetterAuthUserId(email: string): string {
  const normalizedEmail = normalizeEmail(email);
  const stableId = normalizedEmail.replaceAll(/[^a-z0-9]+/gi, '_').slice(0, 48);
  return `ba_dev_${stableId || 'browse'}`;
}

function shouldUseDeterministicClerkTestUser(): boolean {
  return (
    process.env.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1'
  );
}

/**
 * Ensure a Better Auth test user exists in `ba_users` and return the BA user
 * id (plan decision 10, commit ⑨). Direct drizzle upsert — no Clerk API
 * call. The BA user id is deterministic per email so the caller can link it
 * to the app `users` row via `betterAuthUserId`. The caller then mints a
 * real `ba_sessions` row via `auth.$context.internalAdapter.createSession`.
 */
export async function ensureBetterAuthTestUser({
  email,
  fullName,
}: {
  email: string;
  fullName: string;
}): Promise<string> {
  const normalizedEmail = normalizeEmail(email) ?? email;
  const baUserId = getDeterministicTestBetterAuthUserId(normalizedEmail);

  // Upsert into ba_users — idempotent. `onConflictDoUpdate` on the
  // primary key (id) so concurrent callers converge.
  await db
    .insert(baUsers)
    .values({
      id: baUserId,
      name: fullName,
      email: normalizedEmail,
      emailVerified: true,
    })
    .onConflictDoUpdate({
      target: baUsers.id,
      set: {
        name: fullName,
        email: normalizedEmail,
        emailVerified: true,
        updatedAt: new Date(),
      },
    });

  return baUserId;
}

function resolveMatchedSeedUser(
  matchedUsers: readonly MatchedSeedUser[],
  values: SeededUserValues
): ResolvedSeedUserMatch {
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
    if (isAllowlistedTestAccountEmail(normalizedEmail)) {
      return {
        user: emailMatch,
        staleClerkIdUsers: [clerkIdMatch],
      };
    }

    throw new Error(
      `Conflicting test user matches for ${values.email ?? 'unknown email'}`
    );
  }

  return {
    user: clerkIdMatch ?? emailMatch ?? matchedUsers[0],
    staleClerkIdUsers: [],
  };
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

function getRetiredTestClerkId(matchedUser: MatchedSeedUser): string {
  const stableSuffix =
    matchedUser.id.replaceAll(/[^a-z0-9]+/gi, '_').slice(0, 24) || 'row';

  return `${matchedUser.clerkId ?? 'user_dev_test'}__stale_${stableSuffix}`;
}

async function retireStaleSeedUserClerkIds(
  database: DbOrTransaction,
  matchedUsers: readonly MatchedSeedUser[]
) {
  for (const matchedUser of matchedUsers) {
    await database
      .update(users)
      .set({
        clerkId: getRetiredTestClerkId(matchedUser),
        updatedAt: new Date(),
      })
      .where(eq(users.id, matchedUser.id));
  }
}

export async function resolveClerkTestUserId(
  email: string,
  fallbackClerkId?: string
): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  const secretKey = process.env.CLERK_SECRET_KEY;
  const deterministicClerkId =
    fallbackClerkId ?? getDeterministicTestClerkId(normalizedEmail || email);

  if (!normalizedEmail || shouldUseDeterministicClerkTestUser()) {
    return deterministicClerkId;
  }

  if (!secretKey?.startsWith('sk_test_')) {
    return deterministicClerkId;
  }

  if (!isAllowlistedTestAccountEmail(normalizedEmail)) {
    return deterministicClerkId;
  }

  const clerk = await lazyCreateClerkClient({ secretKey });
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
  const deterministicClerkId =
    fallbackClerkId ?? getDeterministicTestClerkId(normalizedEmail || email);

  if (shouldUseDeterministicClerkTestUser()) {
    return deterministicClerkId;
  }

  if (!secretKey?.startsWith('sk_test_')) {
    return deterministicClerkId;
  }

  if (!isAllowlistedTestAccountEmail(normalizedEmail)) {
    return deterministicClerkId;
  }

  const clerk = await lazyCreateClerkClient({ secretKey });
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

export async function ensureLiveClerkTestUser({
  email,
  username,
  firstName,
  lastName,
  metadata,
}: EnsureClerkTestUserOptions): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey?.startsWith('sk_test_')) {
    throw new Error(
      'Live Clerk test user provisioning requires a test Clerk secret key.'
    );
  }

  if (!isAllowlistedTestAccountEmail(normalizedEmail)) {
    throw new Error(
      `Live Clerk test user provisioning is limited to Jovie test accounts: ${normalizedEmail}`
    );
  }

  const clerk = await lazyCreateClerkClient({ secretKey });
  const existingUsers = await clerk.users.getUserList({
    emailAddress: [normalizedEmail],
  });
  const existingUser = existingUsers.data[0];

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
    if (!isClerkIdentificationExistsError(error)) {
      throw error;
    }

    return resolveRacedClerkUser(clerk, normalizedEmail, undefined, error);
  }
}

async function resolveRacedClerkUser(
  clerk: ClerkClient,
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
  const existingMatch = resolveMatchedSeedUser(matchedUsers, values);
  const existingUser = existingMatch.user;

  const normalizedValues = {
    ...values,
    email: normalizedEmail,
  };

  if (existingUser) {
    await retireStaleSeedUserClerkIds(
      database,
      existingMatch.staleClerkIdUsers
    );

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
    const racedMatch = resolveMatchedSeedUser(racedUsers, normalizedValues);
    const racedUser = racedMatch.user;

    if (!racedUser) {
      throw error;
    }

    await retireStaleSeedUserClerkIds(database, racedMatch.staleClerkIdUsers);

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
