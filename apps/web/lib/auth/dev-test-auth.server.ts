import 'server-only';

import { eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
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
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  DEFAULT_TEST_AVATAR_URL,
  ensureClerkTestUser,
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

const DEFAULT_CREATOR_EMAIL = 'browse+clerk_test@jov.ie';
const DEFAULT_CREATOR_USERNAME = 'browse-test-user';
const DEFAULT_CREATOR_FULL_NAME = 'Browse Test User';
const DEFAULT_CREATOR_BIO =
  'Stable creator profile for local browse QA and dashboard verification.';
const DEFAULT_CREATOR_VENMO = 'browse-test-user';
const DEFAULT_READY_CREATOR_EMAIL = 'browse-ready+clerk_test@jov.ie';
const DEFAULT_READY_CREATOR_USERNAME = 'browse-ready-user';
const DEFAULT_READY_CREATOR_FULL_NAME = 'Browse Ready User';
const DEFAULT_READY_CREATOR_BIO =
  'Stable creator profile with a publishable baseline for perf measurement.';
const DEFAULT_READY_CREATOR_VENMO = 'browse-ready-user';
const DEFAULT_READY_CREATOR_SPOTIFY_URL =
  'https://open.spotify.com/artist/4NHQUkpP4uKj7LKEMstSxN';

const DEFAULT_ADMIN_EMAIL = 'browse-admin+clerk_test@jov.ie';
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

function isProductionEnvironment(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production'
  );
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
  if (isProductionEnvironment()) {
    return {
      enabled: false,
      trustedHost: false,
      reason: 'Not available in production',
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
  clerkUserId: string,
  requestedPersona: DevTestAuthPersona | null
): Promise<DevTestAuthSession> {
  const [matchedUser] = await db
    .select({
      dbUserId: users.id,
      clerkUserId: users.clerkId,
      email: users.email,
      fullName: users.name,
      isAdmin: users.isAdmin,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
    })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.id, users.activeProfileId))
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (!matchedUser) {
    return getFallbackActorFromPersona(
      clerkUserId,
      requestedPersona ?? 'creator'
    );
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
    clerkUserId: matchedUser.clerkUserId,
    email: matchedUser.email ?? config.email,
    username,
    fullName,
    isAdmin: matchedUser.isAdmin,
    profilePath: username ? `/${username}` : null,
  };
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
    const clerkUserId = resolveTestBypassUserId(headerStore, cookieStore);

    if (!clerkUserId) {
      return null;
    }

    const requestedPersona = parseDevTestAuthPersona(
      cookieStore.get(TEST_PERSONA_COOKIE)?.value
    );

    return findDevTestAuthSession(clerkUserId, requestedPersona);
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
  const fallbackClerkId =
    persona === 'admin' ? process.env.E2E_CLERK_ADMIN_ID : undefined;
  const clerkUserId = await ensureClerkTestUser({
    email: config.email,
    username: config.username,
    firstName: config.firstName,
    lastName: config.lastName,
    fallbackClerkId,
    metadata: {
      role: persona,
      env: 'dev',
      purpose: 'browse-auth-bootstrap',
    },
  });

  const { id: dbUserId, previousClerkId } = await ensureUserRecord(db, {
    clerkId: clerkUserId,
    email: config.email,
    name: config.fullName,
    userStatus: 'active',
    isAdmin: config.isAdmin,
    // Ready creator is the paid dashboard QA baseline for gated surfaces.
    ...(persona === 'creator-ready'
      ? { plan: 'pro' as const, isPro: true, billingUpdatedAt: new Date() }
      : {}),
  });

  await ensurePersonaProfile(persona, dbUserId, config);
  const profilePath = `/${config.username}`;

  try {
    await invalidateTestUserCaches(
      [previousClerkId, clerkUserId].filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0
      )
    );
  } catch (error) {
    logger.warn(
      'Failed to invalidate dev test auth caches',
      {
        clerkUserId,
        previousClerkId,
        error: error instanceof Error ? error.message : String(error),
      },
      'dev-test-auth'
    );
  }

  return {
    persona,
    clerkUserId,
    email: config.email,
    username: config.username,
    fullName: config.fullName,
    isAdmin: config.isAdmin,
    profilePath,
  };
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
