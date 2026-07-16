import 'server-only';

import { eq, or } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { auth } from '@/lib/auth/better-auth';
import { DEFAULT_DEV_TEST_AUTH_EMAILS } from '@/lib/auth/dev-test-auth-identity';
import type {
  ClientAuthBootstrap,
  DevTestAuthActor,
  DevTestAuthPersona,
} from '@/lib/auth/dev-test-auth-types';
import {
  isTestAuthBypassEnabled,
  isTrustedTestBypassHostname,
  resolveTestBypassUserId,
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_PERSONA_COOKIE,
  TEST_USER_ID_COOKIE,
} from '@/lib/auth/test-mode';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { baUsers } from '@/lib/db/schema/better-auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  DEVELOPMENT_ONLY_ERROR,
  isExplicitDevelopmentEnvironment,
  isLocalDevelopmentAutomationHostname,
} from '@/lib/security/development-only';
import {
  DEFAULT_TEST_AVATAR_URL,
  ensureBetterAuthTestUser,
  ensureCreatorProfileRecord,
  ensureSocialLinkRecord,
  ensureUserProfileClaim,
  ensureUserRecord,
  invalidateTestUserCaches,
  setActiveProfileForUser,
} from '@/lib/testing/test-user-provision.server';
import { normalizeEmail } from '@/lib/utils/email';
import { logger } from '@/lib/utils/logger';

const DEV_TEST_AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;

const DEFAULT_CREATOR_EMAIL = DEFAULT_DEV_TEST_AUTH_EMAILS.creator;
const DEFAULT_CREATOR_USERNAME = 'browse-test-user';
const DEFAULT_CREATOR_FULL_NAME = 'Browse Test User';
const DEFAULT_CREATOR_BIO =
  'Stable creator profile for local browse QA and dashboard verification.';
const DEFAULT_CREATOR_VENMO = 'browse-test-user';
const DEFAULT_READY_CREATOR_EMAIL =
  DEFAULT_DEV_TEST_AUTH_EMAILS['creator-ready'];
const DEFAULT_READY_CREATOR_USERNAME = 'browse-ready-user';
const DEFAULT_READY_CREATOR_FULL_NAME = 'Browse Ready User';
const DEFAULT_READY_CREATOR_BIO =
  'Stable creator profile with a publishable baseline for perf measurement.';
const DEFAULT_READY_CREATOR_VENMO = 'browse-ready-user';
const DEFAULT_READY_CREATOR_SPOTIFY_URL =
  'https://open.spotify.com/artist/4NHQUkpP4uKj7LKEMstSxN';

const DEFAULT_ADMIN_EMAIL = DEFAULT_DEV_TEST_AUTH_EMAILS.admin;
const DEFAULT_ADMIN_USERNAME = 'browse-admin-user';
const DEFAULT_ADMIN_FULL_NAME = 'Browse Admin';
const DEFAULT_ADMIN_BIO =
  'Stable admin profile for local perf checks and admin-shell QA.';
const DEFAULT_ADMIN_VENMO = 'browse-admin-user';

interface DevTestAuthAvailability {
  readonly enabled: boolean;
  readonly trustedHost: boolean;
  readonly reason: string | null;
}

interface DevTestAuthSession extends DevTestAuthActor {
  readonly dbUserId: string;
}

interface PersonaSeedConfig {
  readonly persona: DevTestAuthPersona;
  readonly email: string;
  readonly username: string;
  readonly fullName: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly isAdmin: boolean;
  readonly profilePath: string | null;
}

function splitFullName(fullName: string) {
  const [firstName = fullName, ...rest] = fullName.trim().split(/\s+/);
  return {
    firstName,
    lastName: rest.join(' ').trim() || '',
  };
}

function resolvePersonaSeedConfig(
  persona: DevTestAuthPersona
): PersonaSeedConfig {
  if (persona === 'admin') {
    const email = normalizeEmail(
      process.env.E2E_CLERK_ADMIN_USERNAME ?? DEFAULT_ADMIN_EMAIL
    );
    const fullName = DEFAULT_ADMIN_FULL_NAME;
    const { firstName, lastName } = splitFullName(fullName);

    return {
      persona,
      email,
      username: DEFAULT_ADMIN_USERNAME,
      fullName,
      firstName,
      lastName,
      isAdmin: true,
      profilePath: `/${DEFAULT_ADMIN_USERNAME}`,
    };
  }

  if (persona === 'creator-ready') {
    const fullName = DEFAULT_READY_CREATOR_FULL_NAME;
    const { firstName, lastName } = splitFullName(fullName);

    return {
      persona,
      email: DEFAULT_READY_CREATOR_EMAIL,
      username: DEFAULT_READY_CREATOR_USERNAME,
      fullName,
      firstName,
      lastName,
      isAdmin: false,
      profilePath: `/${DEFAULT_READY_CREATOR_USERNAME}`,
    };
  }

  const fullName = DEFAULT_CREATOR_FULL_NAME;
  const { firstName, lastName } = splitFullName(fullName);

  return {
    persona,
    email: DEFAULT_CREATOR_EMAIL,
    username: DEFAULT_CREATOR_USERNAME,
    fullName,
    firstName,
    lastName,
    isAdmin: false,
    profilePath: `/${DEFAULT_CREATOR_USERNAME}`,
  };
}

export function parseDevTestAuthPersona(
  value: string | null | undefined
): DevTestAuthPersona | null {
  if (value === 'creator' || value === 'creator-ready' || value === 'admin') {
    return value;
  }

  return null;
}

export function getDevTestAuthAvailability(
  hostname: string | null
): DevTestAuthAvailability {
  if (!isExplicitDevelopmentEnvironment()) {
    const loopbackAutomationEnabled =
      isTestAuthBypassEnabled() &&
      isLocalDevelopmentAutomationHostname(hostname) &&
      process.env.VERCEL_ENV !== 'production' &&
      process.env.VERCEL_ENV !== 'preview';

    if (loopbackAutomationEnabled) {
      return {
        enabled: true,
        trustedHost: true,
        reason: null,
      };
    }

    return {
      enabled: false,
      trustedHost: false,
      reason: DEVELOPMENT_ONLY_ERROR,
    };
  }

  const enabled = isTestAuthBypassEnabled();
  const trustedHost = isTrustedTestBypassHostname(hostname);

  if (!enabled) {
    return {
      enabled: false,
      trustedHost,
      reason: 'E2E_USE_TEST_AUTH_BYPASS is not enabled',
    };
  }

  if (!trustedHost) {
    return {
      enabled: true,
      trustedHost: false,
      reason: 'Only available on loopback and private dev hosts',
    };
  }

  return {
    enabled: true,
    trustedHost: true,
    reason: null,
  };
}

function getFallbackActorFromPersona(
  clerkUserId: string,
  persona: DevTestAuthPersona
): DevTestAuthSession {
  const config = resolvePersonaSeedConfig(persona);

  return {
    dbUserId: clerkUserId,
    persona,
    clerkUserId,
    email: config.email,
    username: config.username,
    fullName: config.fullName,
    isAdmin: config.isAdmin,
    profilePath: config.profilePath,
  };
}

async function findDevTestAuthSession(
  authUserId: string,
  requestedPersona: DevTestAuthPersona | null,
  allowSyntheticFallback = true
): Promise<DevTestAuthSession | null> {
  let matchedUser:
    | {
        dbUserId: string;
        clerkUserId: string | null;
        betterAuthUserId: string | null;
        email: string | null;
        fullName: string | null;
        isAdmin: boolean;
        username: string | null;
        displayName: string | null;
      }
    | undefined;

  try {
    [matchedUser] = await db
      .select({
        dbUserId: users.id,
        clerkUserId: users.clerkId,
        betterAuthUserId: users.betterAuthUserId,
        email: users.email,
        fullName: users.name,
        isAdmin: users.isAdmin,
        username: creatorProfiles.username,
        displayName: creatorProfiles.displayName,
      })
      .from(users)
      .leftJoin(creatorProfiles, eq(creatorProfiles.id, users.activeProfileId))
      .where(
        or(
          eq(users.betterAuthUserId, authUserId),
          eq(users.clerkId, authUserId)
        )
      )
      .limit(1);
  } catch (error) {
    if (!allowSyntheticFallback) {
      logger.warn('Failed to validate persisted dev test auth actor', {
        authUserId,
        error,
      });
      return null;
    }
    logger.warn('Falling back to synthetic dev test auth actor', {
      authUserId,
      error,
    });
    return getFallbackActorFromPersona(
      authUserId,
      requestedPersona ?? 'creator'
    );
  }

  if (!matchedUser) {
    if (!allowSyntheticFallback) return null;
    return getFallbackActorFromPersona(
      authUserId,
      requestedPersona ?? 'creator'
    );
  }

  if (!matchedUser.betterAuthUserId) {
    return null;
  }

  const persona =
    requestedPersona ?? (matchedUser.isAdmin ? 'admin' : 'creator');
  const config = resolvePersonaSeedConfig(persona);
  const username = matchedUser.username ?? null;
  const fullName =
    matchedUser.displayName ?? matchedUser.fullName ?? config.fullName;

  return {
    dbUserId: matchedUser.dbUserId,
    persona,
    clerkUserId: matchedUser.betterAuthUserId,
    email: matchedUser.email ?? config.email,
    username,
    fullName,
    isAdmin: matchedUser.isAdmin,
    profilePath: username ? `/${username}` : null,
  };
}

export async function ensureExistingDevTestAuthActor(
  betterAuthUserId: string,
  requestedPersona: DevTestAuthPersona | null
): Promise<DevTestAuthActor | null> {
  const actor = await findDevTestAuthSession(
    betterAuthUserId,
    requestedPersona,
    false
  );
  if (!actor) return null;

  await mintBetterAuthSessionForDevTestActor({
    dbUserId: actor.dbUserId,
    betterAuthUserId: actor.clerkUserId,
    email: actor.email,
    fullName: actor.fullName,
  });
  return actor;
}

async function ensurePersonaProfile(
  persona: DevTestAuthPersona,
  dbUserId: string,
  config: PersonaSeedConfig
) {
  const isAdminPersona = persona === 'admin';
  const isReadyCreatorPersona = persona === 'creator-ready';
  const isIncompleteCreatorPersona =
    persona === 'creator' && !isAdminPersona && !isReadyCreatorPersona;
  let bio = DEFAULT_CREATOR_BIO;
  let venmoHandle = DEFAULT_CREATOR_VENMO;

  if (isAdminPersona) {
    bio = DEFAULT_ADMIN_BIO;
    venmoHandle = DEFAULT_ADMIN_VENMO;
  } else if (isReadyCreatorPersona) {
    bio = DEFAULT_READY_CREATOR_BIO;
    venmoHandle = DEFAULT_READY_CREATOR_VENMO;
  }

  const profileId = await ensureCreatorProfileRecord(db, {
    userId: dbUserId,
    creatorType: 'artist',
    username: config.username,
    usernameNormalized: config.username.toLowerCase(),
    displayName: config.fullName,
    bio,
    venmoHandle,
    avatarUrl: DEFAULT_TEST_AVATAR_URL,
    spotifyUrl: isReadyCreatorPersona
      ? DEFAULT_READY_CREATOR_SPOTIFY_URL
      : null,
    appleMusicUrl: null,
    appleMusicId: null,
    youtubeMusicId: null,
    deezerId: null,
    tidalId: null,
    soundcloudId: null,
    isPublic: isAdminPersona ? false : !isIncompleteCreatorPersona,
    isVerified: false,
    isClaimed: true,
    ingestionStatus: 'idle',
    onboardingCompletedAt: isIncompleteCreatorPersona ? null : new Date(),
  });

  await ensureUserProfileClaim(db, dbUserId, profileId);
  await setActiveProfileForUser(db, dbUserId, profileId);

  if (!isAdminPersona) {
    await ensureSocialLinkRecord(db, {
      creatorProfileId: profileId,
      platform: 'venmo',
      platformType: 'payment',
      url: `https://venmo.com/${
        isReadyCreatorPersona
          ? DEFAULT_READY_CREATOR_VENMO
          : DEFAULT_CREATOR_VENMO
      }`,
      displayText: 'Tip on Venmo',
      isActive: true,
      sortOrder: 1,
      state: 'active',
    });
  }
}

export const getCachedDevTestAuthSession = cache(async () => {
  if (!isTestAuthBypassEnabled()) {
    return null;
  }

  try {
    const headerStore = await headers();
    const cookieStore = await cookies();
    // The test-mode cookie/header now carries the Better Auth user id
    // (Clerk → Better Auth migration, commit ⑨). The `resolveTestBypassUserId`
    // return value is treated as the BA user id for lookup.
    const betterAuthUserId = resolveTestBypassUserId(headerStore, cookieStore);

    if (!betterAuthUserId) {
      return null;
    }

    const requestedPersona = parseDevTestAuthPersona(
      cookieStore.get(TEST_PERSONA_COOKIE)?.value
    );

    return findDevTestAuthSession(betterAuthUserId, requestedPersona);
  } catch (error) {
    logger.warn(
      'Failed to resolve cached dev test auth session',
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'dev-test-auth'
    );
    return null;
  }
});

export function buildDevTestAuthCurrentUser(session: DevTestAuthSession) {
  const { firstName, lastName } = splitFullName(session.fullName);

  return {
    id: session.clerkUserId,
    username: session.username,
    firstName,
    lastName: lastName || null,
    fullName: session.fullName,
    imageUrl: DEFAULT_TEST_AVATAR_URL,
    primaryEmailAddress: {
      emailAddress: session.email,
      verification: {
        status: 'verified',
      },
    },
    emailAddresses: [
      {
        emailAddress: session.email,
        verification: {
          status: 'verified',
        },
      },
    ],
    externalAccounts: [],
    privateMetadata: {
      isAdmin: session.isAdmin,
      devTestAuthPersona: session.persona,
    },
  };
}

export async function getClientAuthBootstrap(): Promise<ClientAuthBootstrap | null> {
  const session = await getCachedDevTestAuthSession();

  if (!session) {
    return null;
  }

  return {
    isAuthenticated: true,
    userId: session.clerkUserId,
    email: session.email,
    username: session.username,
    fullName: session.fullName,
    isAdmin: session.isAdmin,
    persona: session.persona,
  };
}

export async function ensureDevTestAuthActor(
  persona: DevTestAuthPersona
): Promise<DevTestAuthActor> {
  const config = resolvePersonaSeedConfig(persona);

  // Clerk → Better Auth migration, commit ⑨: replace Clerk user creation
  // with direct drizzle upsert into ba_users. The BA user id is
  // deterministic per email and used as the `betterAuthUserId` on the app
  // `users` row. No Clerk API call — the dev bypass path needs zero external
  // services (plan decision 10, TTHW acceptance criterion).
  const betterAuthUserId = await ensureBetterAuthTestUser({
    email: config.email,
    fullName: config.fullName,
  });

  return ensureDevTestAuthActorForBetterAuthUser(
    persona,
    config,
    betterAuthUserId
  );
}

export async function ensureLiveDevTestAuthActor(
  persona: DevTestAuthPersona
): Promise<DevTestAuthActor> {
  // Under Better Auth the live/deterministic distinction collapses —
  // `ensureBetterAuthTestUser` is always direct drizzle (no Clerk API to
  // be live vs deterministic about). Kept as a separate export for source
  // compat with the mobile-callback route.
  return ensureDevTestAuthActor(persona);
}

async function ensureDevTestAuthActorForBetterAuthUser(
  persona: DevTestAuthPersona,
  config: PersonaSeedConfig,
  betterAuthUserId: string
): Promise<DevTestAuthActor> {
  const { id: dbUserId, previousClerkId } = await ensureUserRecord(db, {
    clerkId: betterAuthUserId, // clerk_id column is the legacy field; now carries BA user id for dev test users
    email: config.email,
    name: config.fullName,
    userStatus: 'active',
    isAdmin: config.isAdmin,
    betterAuthUserId,
    ...(persona === 'admin'
      ? { plan: 'max' as const, isPro: true, billingUpdatedAt: new Date() }
      : {}),
    // Ready creator is the paid dashboard QA baseline for gated surfaces.
    ...(persona === 'creator-ready'
      ? { plan: 'pro' as const, isPro: true, billingUpdatedAt: new Date() }
      : {}),
  });

  await ensurePersonaProfile(persona, dbUserId, config);
  const profilePath = `/${config.username}`;

  try {
    await invalidateTestUserCaches(
      [previousClerkId, betterAuthUserId].filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0
      )
    );
  } catch (error) {
    logger.warn(
      'Failed to invalidate dev test auth caches',
      {
        betterAuthUserId,
        previousClerkId,
        error: error instanceof Error ? error.message : String(error),
      },
      'dev-test-auth'
    );
  }

  // Mint a real Better Auth session — this is the primary path now (not
  // best-effort). The session cookie is set by the dev bypass route's
  // `buildDevTestAuthCookieDescriptors`; the BA session row means any
  // direct `auth.api.getSession` call site sees a real session.
  await mintBetterAuthSessionForDevTestActor({
    dbUserId,
    betterAuthUserId,
    email: config.email,
    fullName: config.fullName,
  });

  return {
    persona,
    clerkUserId: betterAuthUserId, // field name preserved for shape compat; carries BA user id
    email: config.email,
    username: config.username,
    fullName: config.fullName,
    isAdmin: config.isAdmin,
    profilePath,
  };
}

/**
 * Mint a real Better Auth session for a dev/E2E bypass persona (plan
 * decision 10, audit row 39 — TTHW acceptance criterion). The bypass path
 * in `cached.ts` still short-circuits before `auth.api.getSession`, so the
 * test-mode cookie continues to drive the cached auth result; minting the
 * BA row + session means any direct `auth.api.getSession` call site
 * (auth-page signed-in redirects per audit row 16) and the ba_sessions
 * audit trail see a real session.
 *
 * Best-effort: never throws. Failures are logged via `logger.warn` so the
 * dev bypass route stays available when Better Auth infra is absent (local
 * dev without Redis, fresh clone without ba_users seeded, etc.).
 */
async function mintBetterAuthSessionForDevTestActor(params: {
  dbUserId: string;
  betterAuthUserId: string;
  email: string;
  fullName: string;
}): Promise<void> {
  const { dbUserId, betterAuthUserId, email, fullName } = params;

  // Link the app users row to the BA user id if not already linked.
  const [appUser] = await db
    .select({ id: users.id, betterAuthUserId: users.betterAuthUserId })
    .from(users)
    .where(eq(users.id, dbUserId))
    .limit(1);
  if (!appUser) {
    return;
  }

  if (appUser.betterAuthUserId !== betterAuthUserId) {
    await db
      .update(users)
      .set({ betterAuthUserId, updatedAt: new Date() })
      .where(eq(users.id, dbUserId));
  }

  // Ensure the ba_users row exists (idempotent with ensureBetterAuthTestUser
  // but safe to repeat in case the upsert raced).
  await db
    .insert(baUsers)
    .values({
      id: betterAuthUserId,
      name: fullName,
      email,
      emailVerified: true,
    })
    .onConflictDoUpdate({
      target: baUsers.id,
      set: { name: fullName, emailVerified: true, updatedAt: new Date() },
    });

  const ctx = await auth.$context;
  await ctx.internalAdapter.createSession(betterAuthUserId, false);
}

export function buildDevTestAuthCookieDescriptors(
  actor: DevTestAuthActor,
  secure: boolean
) {
  const baseCookie = {
    httpOnly: true,
    maxAge: DEV_TEST_AUTH_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax' as const,
    secure,
  };

  return [
    {
      name: TEST_MODE_COOKIE,
      value: TEST_AUTH_BYPASS_MODE,
      ...baseCookie,
    },
    {
      name: TEST_USER_ID_COOKIE,
      value: actor.clerkUserId,
      ...baseCookie,
    },
    {
      name: TEST_PERSONA_COOKIE,
      value: actor.persona,
      ...baseCookie,
    },
  ];
}

export const DEV_TEST_AUTH_COOKIE_NAMES = [
  TEST_MODE_COOKIE,
  TEST_USER_ID_COOKIE,
  TEST_PERSONA_COOKIE,
] as const;

export function sanitizeDevTestAuthRedirectPath(
  value: string | null | undefined
): string | null {
  if (!value) {
    return '/app';
  }

  if (!value.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  return value;
}
