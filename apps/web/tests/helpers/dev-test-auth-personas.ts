import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { DevTestAuthPersona } from '@/lib/auth/dev-test-auth-types';
import {
  DEFAULT_TEST_AVATAR_URL,
  ensureCreatorProfileRecord,
  ensureSocialLinkRecord,
  ensureUserProfileClaim,
  ensureUserRecord,
  getDeterministicTestClerkId,
  setActiveProfileForUser,
} from '@/lib/testing/test-user-provision.server';

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

interface PersonaSeedConfig {
  readonly persona: DevTestAuthPersona;
  readonly email: string;
  readonly username: string;
  readonly fullName: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly isAdmin: boolean;
  readonly bio: string;
  readonly venmoHandle: string;
  readonly spotifyUrl: string | null;
}

export interface DevTestAuthPersonaActor {
  readonly persona: DevTestAuthPersona;
  readonly clerkUserId: string;
  readonly email: string;
  readonly username: string;
  readonly profilePath: string;
}

function createBypassProvisioningDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required to provision a dev test auth persona.'
    );
  }

  return drizzle(neon(databaseUrl));
}

let bypassProvisioningDb: ReturnType<typeof createBypassProvisioningDb> | null =
  null;

function getBypassProvisioningDb() {
  bypassProvisioningDb ??= createBypassProvisioningDb();
  return bypassProvisioningDb;
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
    const fullName = DEFAULT_ADMIN_FULL_NAME;
    const { firstName, lastName } = splitFullName(fullName);

    return {
      persona,
      email: DEFAULT_ADMIN_EMAIL,
      username: DEFAULT_ADMIN_USERNAME,
      fullName,
      firstName,
      lastName,
      isAdmin: true,
      bio: DEFAULT_ADMIN_BIO,
      venmoHandle: DEFAULT_ADMIN_VENMO,
      spotifyUrl: null,
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
      bio: DEFAULT_READY_CREATOR_BIO,
      venmoHandle: DEFAULT_READY_CREATOR_VENMO,
      spotifyUrl: DEFAULT_READY_CREATOR_SPOTIFY_URL,
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
    bio: DEFAULT_CREATOR_BIO,
    venmoHandle: DEFAULT_CREATOR_VENMO,
    spotifyUrl: null,
  };
}

export function resolveDevTestAuthPersona(
  value: string | null | undefined
): DevTestAuthPersona | null {
  if (value === 'creator' || value === 'creator-ready' || value === 'admin') {
    return value;
  }

  return null;
}

export async function ensureDevTestAuthPersona(
  persona: DevTestAuthPersona
): Promise<DevTestAuthPersonaActor> {
  const database = getBypassProvisioningDb();
  const config = resolvePersonaSeedConfig(persona);
  const clerkUserId = getDeterministicTestClerkId(config.email);
  const { id: dbUserId } = await ensureUserRecord(database, {
    clerkId: clerkUserId,
    email: config.email,
    name: config.fullName,
    userStatus: 'active',
    isAdmin: config.isAdmin,
    ...(persona === 'creator-ready'
      ? { plan: 'pro' as const, isPro: true, billingUpdatedAt: new Date() }
      : {}),
  });
  const isIncompleteCreatorPersona = persona === 'creator';
  const profileId = await ensureCreatorProfileRecord(database, {
    userId: dbUserId,
    creatorType: 'artist',
    username: config.username,
    usernameNormalized: config.username.toLowerCase(),
    displayName: config.fullName,
    bio: config.bio,
    venmoHandle: config.venmoHandle,
    avatarUrl: DEFAULT_TEST_AVATAR_URL,
    spotifyUrl: config.spotifyUrl,
    appleMusicUrl: null,
    appleMusicId: null,
    youtubeMusicId: null,
    deezerId: null,
    tidalId: null,
    soundcloudId: null,
    isPublic: !config.isAdmin && !isIncompleteCreatorPersona,
    isVerified: false,
    isClaimed: true,
    ingestionStatus: 'idle',
    onboardingCompletedAt: isIncompleteCreatorPersona ? null : new Date(),
  });

  await ensureUserProfileClaim(database, dbUserId, profileId);
  await setActiveProfileForUser(database, dbUserId, profileId);

  if (!config.isAdmin) {
    await ensureSocialLinkRecord(database, {
      creatorProfileId: profileId,
      platform: 'venmo',
      platformType: 'payment',
      url: `https://venmo.com/${config.venmoHandle}`,
      displayText: 'Tip on Venmo',
      isActive: true,
      sortOrder: 1,
      state: 'active',
    });
  }

  return {
    persona,
    clerkUserId,
    email: config.email,
    username: config.username,
    profilePath: `/${config.username}`,
  };
}
