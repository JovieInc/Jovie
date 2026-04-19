/**
 * E2E Test Database Seeding
 *
 * Seeds the test database with minimal required data for smoke tests.
 * Run this before E2E tests to ensure test profiles exist.
 *
 * ESLint exceptions:
 * - no-restricted-imports: Seed scripts import full schema for flexibility
 */

/* eslint-disable no-restricted-imports */
import { neon } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/lib/db/schema';
import {
  DEFAULT_TEST_AVATAR_URL,
  ensureCreatorProfileRecord as ensureCreatorProfile,
  ensureSocialLinkRecord as ensureSocialLink,
  ensureUserRecord as ensureUser,
  ensureUserProfileClaim,
  getDeterministicTestClerkId as getSeedDeterministicClerkId,
  isAllowlistedPrivilegedTestAccountEmail,
  resolveClerkTestUserId as resolveSeedUserClerkId,
  setActiveProfileForUser as setActiveProfile,
} from '@/lib/testing/test-user-provision.server';
import { normalizeEmail } from '@/lib/utils/email';

// Use the same HTTP driver as the app for consistency
const {
  creatorContacts,
  discogReleases,
  discogTracks,
  promoDownloads,
  providers,
  providerLinks,
  tourDates,
  users,
} = schema;

interface TestProfile {
  username: string;
  displayName: string;
  bio: string;
  spotifyUrl?: string;
  avatarUrl?: string;
}

interface SeedTestDataOptions {
  readonly publicProfilesOnly?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const DEFAULT_TEST_RELEASE_ARTWORK_URL = '/android-chrome-512x512.png';

const REQUIRED_PUBLIC_QA_PROVIDERS = [
  {
    id: 'spotify',
    displayName: 'Spotify',
    kind: 'music_streaming' as const,
    baseUrl: 'https://open.spotify.com',
  },
  {
    id: 'tiktok_sound',
    displayName: 'TikTok',
    kind: 'video' as const,
    baseUrl: 'https://www.tiktok.com',
  },
  {
    id: 'instagram_reels',
    displayName: 'Instagram Reels',
    kind: 'video' as const,
    baseUrl: 'https://www.instagram.com',
  },
  {
    id: 'youtube_shorts',
    displayName: 'YouTube Shorts',
    kind: 'video' as const,
    baseUrl: 'https://www.youtube.com',
  },
] as const;

function getFutureReleaseDate(yearsAhead = 10): Date {
  const releaseDate = new Date();
  releaseDate.setUTCFullYear(releaseDate.getUTCFullYear() + yearsAhead);
  releaseDate.setUTCMonth(11, 1);
  releaseDate.setUTCHours(0, 0, 0, 0);
  return releaseDate;
}
async function withSeedOperationTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function isMissingActiveProfileIdColumn(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  const code =
    typeof error === 'object' && error !== null
      ? ((error as { code?: string; cause?: { code?: string } }).code ??
        (error as { cause?: { code?: string } }).cause?.code)
      : undefined;

  return (
    (code === '42703' || message.includes('does not exist')) &&
    message.includes('active_profile_id') &&
    message.includes('column')
  );
}

export function isRetryableSeedDatabaseError(error: unknown): boolean {
  const messages: string[] = [];
  const codes = new Set<string>();

  let current: unknown = error;
  while (current) {
    if (typeof current === 'object') {
      const message =
        current instanceof Error
          ? current.message
          : typeof (current as { message?: unknown }).message === 'string'
            ? (current as { message: string }).message
            : String(current);
      messages.push(message);

      const code = (current as { code?: string }).code;
      if (typeof code === 'string' && code.length > 0) {
        codes.add(code);
      }

      current = 'cause' in current ? current.cause : undefined;
      continue;
    }

    messages.push(String(current));

    break;
  }

  const message = messages.join(' ').toLowerCase();

  return (
    message.includes('password authentication failed') ||
    message.includes('requested endpoint could not be found') ||
    message.includes("you don't have access to it") ||
    message.includes('connection terminated unexpectedly') ||
    message.includes('server closed the connection unexpectedly') ||
    message.includes('the database system is starting up') ||
    message.includes('fetch failed') ||
    codes.has('57P03') ||
    codes.has('XX000') ||
    codes.has('ECONNRESET')
  );
}

async function withSeedDatabaseRetry<T>(
  operation: () => Promise<T>,
  options: {
    readonly attempts: number;
    readonly initialDelayMs: number;
    readonly label: string;
  }
): Promise<T> {
  let attempt = 0;
  let delayMs = options.initialDelayMs;

  while (true) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      if (attempt >= options.attempts || !isRetryableSeedDatabaseError(error)) {
        throw error;
      }

      console.warn(
        `  ⚠ ${options.label} failed on attempt ${attempt}/${options.attempts}; retrying in ${delayMs}ms`
      );
      await sleep(delayMs);
      delayMs *= 2;
    }
  }
}

const TEST_PROFILES: TestProfile[] = [
  {
    username: 'dualipa',
    displayName: 'Dua Lipa',
    bio: 'Pop artist and songwriter',
    spotifyUrl: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
    avatarUrl: DEFAULT_TEST_AVATAR_URL,
  },
  {
    username: 'taylorswift',
    displayName: 'Taylor Swift',
    bio: 'Singer-songwriter',
    spotifyUrl: 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02',
    avatarUrl: DEFAULT_TEST_AVATAR_URL,
  },
  {
    username: 'testartist',
    displayName: 'Test Artist',
    bio: 'Test artist for E2E tipping tests',
    spotifyUrl: 'https://open.spotify.com/artist/test',
    avatarUrl: DEFAULT_TEST_AVATAR_URL,
  },
];

type SeededReleaseValues = Pick<
  typeof discogReleases.$inferInsert,
  | 'creatorProfileId'
  | 'title'
  | 'slug'
  | 'releaseType'
  | 'releaseDate'
  | 'artworkUrl'
  | 'totalTracks'
  | 'upc'
  | 'label'
  | 'sourceType'
>;

function isMissingRelationError(error: unknown, relationName: string): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  const code =
    typeof error === 'object' && error !== null
      ? ((error as { code?: string; cause?: { code?: string } }).code ??
        (error as { cause?: { code?: string } }).cause?.code)
      : undefined;

  return (
    (code === '42P01' || message.includes('does not exist')) &&
    message.includes(relationName.toLowerCase())
  );
}

export function isMissingPromoDownloadsRelationError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  const code =
    typeof error === 'object' && error !== null
      ? ((error as { code?: string; cause?: { code?: string } }).code ??
        (error as { cause?: { code?: string } }).cause?.code)
      : undefined;

  return (
    (code === '42P01' && isMissingRelationError(error, 'promo_downloads')) ||
    /relation ["']?promo_downloads["']? does not exist/.test(message)
  );
}

function getSeedEnv() {
  // This file is imported by Playwright global setup, so it must not depend on
  // Next's server-only env modules.
  return {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    DATABASE_URL:
      process.env.DATABASE_URL?.trim() ||
      process.env.DATABASE_URL_DIRECT?.trim(),
    DATABASE_URL_DIRECT: process.env.DATABASE_URL_DIRECT?.trim(),
    E2E_CLERK_USER_ID: process.env.E2E_CLERK_USER_ID,
    E2E_CLERK_USER_USERNAME: process.env.E2E_CLERK_USER_USERNAME,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  } as const;
}

function isAllowlistedE2ESeedEmail(
  email: string | null | undefined
): email is string {
  return isAllowlistedPrivilegedTestAccountEmail(email);
}

/** Track template for seeding */
interface TestTrack {
  title: string;
  slug: string;
  trackNumber: number;
  discNumber: number;
  durationMs: number;
  isrc?: string;
  isExplicit?: boolean;
}

/** Release template for seeding */
interface TestRelease {
  title: string;
  slug: string;
  releaseType: 'single' | 'album' | 'ep' | 'compilation';
  releaseDate: Date;
  artworkUrl: string;
  spotifyUrl: string;
  totalTracks: number;
  upc?: string;
  label?: string;
  tracks?: TestTrack[];
}

/** Generate track titles for large albums */
function generateTrackTitle(index: number): string {
  const adjectives = [
    'Electric',
    'Fading',
    'Golden',
    'Hidden',
    'Infinite',
    'Lucid',
    'Midnight',
    'Neon',
    'Phantom',
    'Quiet',
    'Rising',
    'Silver',
    'Twilight',
    'Ultraviolet',
    'Velvet',
    'Wandering',
    'Xenon',
    'Yearning',
    'Azure',
    'Burning',
    'Crystal',
    'Drifting',
    'Eternal',
    'Frozen',
  ];
  const nouns = [
    'Skyline',
    'Echoes',
    'Horizon',
    'Waves',
    'Dream',
    'Light',
    'Shadow',
    'Pulse',
    'Signal',
    'Storm',
    'Vision',
    'Flame',
    'Rain',
    'Coast',
    'Bridge',
    'Mirror',
    'River',
    'Garden',
    'Ocean',
    'Forest',
    'Mountain',
    'Desert',
    'Valley',
    'Dawn',
  ];
  const adj = adjectives[index % adjectives.length];
  const noun = nouns[index % nouns.length];
  // Add a number suffix for uniqueness in large sets
  return index < 24
    ? `${adj} ${noun}`
    : `${adj} ${noun} ${Math.floor(index / 24) + 1}`;
}

/** Generate slug from title */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Generate a fake ISRC (globally unique via module-level counter) */
let isrcCounter = 100;
function generateIsrc(): string {
  return `USAT2${String(isrcCounter++).padStart(7, '0')}`;
}

/** Generate tracks for a release */
function generateTracks(
  count: number,
  discCount = 1,
  options?: { explicitRate?: number }
): TestTrack[] {
  const explicitRate = options?.explicitRate ?? 0.1;
  const tracksPerDisc = Math.ceil(count / discCount);
  const tracks: TestTrack[] = [];

  for (let i = 0; i < count; i++) {
    const discNumber = Math.floor(i / tracksPerDisc) + 1;
    const trackNumber = (i % tracksPerDisc) + 1;
    const title = generateTrackTitle(i);
    tracks.push({
      title,
      slug: slugify(title),
      trackNumber,
      discNumber,
      durationMs: 120000 + Math.floor(Math.random() * 240000), // 2-6 min
      isrc: generateIsrc(),
      isExplicit: Math.random() < explicitRate,
    });
  }
  return tracks;
}

/** Tour date template for seeding */
interface TestTourDate {
  /** Deterministic external ID for idempotent seeding */
  externalId: string;
  title: string | null;
  venueName: string;
  city: string;
  region: string | null;
  country: string;
  provider: 'bandsintown' | 'songkick' | 'manual';
  ticketStatus: 'available' | 'sold_out' | 'cancelled';
  ticketUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  /** Months from now (negative = past) */
  monthsFromNow: number;
  startTime: string | null;
}

/** Generate a future (or past) date offset by months from today */
function dateMonthsFromNow(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  d.setHours(20, 0, 0, 0); // Default 8 PM
  return d;
}

const TEST_TOUR_DATES: TestTourDate[] = [
  {
    externalId: 'seed-wiltern-la',
    title: 'Summer Tour 2026',
    venueName: 'The Wiltern',
    city: 'Los Angeles',
    region: 'CA',
    country: 'USA',
    provider: 'manual',
    ticketStatus: 'available',
    ticketUrl: 'https://www.ticketmaster.com/event/abc123',
    latitude: 34.05,
    longitude: -118.24,
    timezone: 'America/Los_Angeles',
    monthsFromNow: 3,
    startTime: '8:00 PM',
  },
  {
    externalId: 'seed-brooklyn-steel-nyc',
    title: null,
    venueName: 'Brooklyn Steel',
    city: 'New York',
    region: 'NY',
    country: 'USA',
    provider: 'bandsintown',
    ticketStatus: 'available',
    ticketUrl: 'https://www.axs.com/events/xyz456',
    latitude: 40.71,
    longitude: -74.01,
    timezone: 'America/New_York',
    monthsFromNow: 4,
    startTime: '7:30 PM',
  },
  {
    externalId: 'seed-o2-brixton-london',
    title: 'UK Headline',
    venueName: 'O2 Academy Brixton',
    city: 'London',
    region: null,
    country: 'UK',
    provider: 'manual',
    ticketStatus: 'available',
    ticketUrl: 'https://www.eventbrite.com/e/123456',
    latitude: 51.51,
    longitude: -0.13,
    timezone: 'Europe/London',
    monthsFromNow: 5,
    startTime: '7:00 PM',
  },
  {
    externalId: 'seed-columbiahalle-berlin',
    title: null,
    venueName: 'Columbiahalle',
    city: 'Berlin',
    region: null,
    country: 'Germany',
    provider: 'bandsintown',
    ticketStatus: 'sold_out',
    ticketUrl: 'https://dice.fm/event/abc-berlin',
    latitude: 52.52,
    longitude: 13.4,
    timezone: 'Europe/Berlin',
    monthsFromNow: 5,
    startTime: '8:00 PM',
  },
  {
    externalId: 'seed-zepp-divercity-tokyo',
    title: 'Asia Tour',
    venueName: 'Zepp DiverCity',
    city: 'Tokyo',
    region: null,
    country: 'Japan',
    provider: 'manual',
    ticketStatus: 'available',
    ticketUrl: 'https://seatgeek.com/event/456',
    latitude: 35.68,
    longitude: 139.69,
    timezone: 'Asia/Tokyo',
    monthsFromNow: 7,
    startTime: '7:00 PM',
  },
  {
    externalId: 'seed-enmore-sydney',
    title: null,
    venueName: 'Enmore Theatre',
    city: 'Sydney',
    region: 'NSW',
    country: 'Australia',
    provider: 'manual',
    ticketStatus: 'cancelled',
    ticketUrl: 'https://www.stubhub.com/event/789',
    latitude: -33.87,
    longitude: 151.21,
    timezone: 'Australia/Sydney',
    monthsFromNow: 8,
    startTime: '8:00 PM',
  },
  {
    externalId: 'seed-ryman-nashville',
    title: null,
    venueName: 'Ryman Auditorium',
    city: 'Nashville',
    region: 'TN',
    country: 'USA',
    provider: 'manual',
    ticketStatus: 'available',
    ticketUrl: 'https://www.bandsintown.com/e/abc-nashville',
    latitude: 36.16,
    longitude: -86.78,
    timezone: 'America/Chicago',
    monthsFromNow: 4,
    startTime: '7:00 PM',
  },
  {
    externalId: 'seed-fillmore-sf',
    title: 'Summer Tour 2026',
    venueName: 'The Fillmore',
    city: 'San Francisco',
    region: 'CA',
    country: 'USA',
    provider: 'manual',
    ticketStatus: 'available',
    ticketUrl: 'https://www.ticketmaster.com/event/def456',
    latitude: 37.77,
    longitude: -122.42,
    timezone: 'America/Los_Angeles',
    monthsFromNow: 3,
    startTime: '8:00 PM',
  },
  {
    externalId: 'seed-acl-live-austin',
    title: null,
    venueName: 'ACL Live',
    city: 'Austin',
    region: 'TX',
    country: 'USA',
    provider: 'bandsintown',
    ticketStatus: 'available',
    ticketUrl: 'https://www.axs.com/events/ghi789',
    latitude: null,
    longitude: null,
    timezone: 'America/Chicago',
    monthsFromNow: 6,
    startTime: '7:30 PM',
  },
  {
    externalId: 'seed-crystal-ballroom-portland',
    title: null,
    venueName: 'Crystal Ballroom',
    city: 'Portland',
    region: 'OR',
    country: 'USA',
    provider: 'manual',
    ticketStatus: 'available',
    ticketUrl: null,
    latitude: 45.52,
    longitude: -122.68,
    timezone: 'America/Los_Angeles',
    monthsFromNow: 5,
    startTime: '8:00 PM',
  },
  {
    externalId: 'seed-metro-chicago',
    title: null,
    venueName: 'Metro Chicago',
    city: 'Chicago',
    region: 'IL',
    country: 'USA',
    provider: 'manual',
    ticketStatus: 'sold_out',
    ticketUrl: 'https://www.ticketmaster.com/event/past123',
    latitude: 41.88,
    longitude: -87.63,
    timezone: 'America/Chicago',
    monthsFromNow: -1,
    startTime: '9:00 PM',
  },
  {
    externalId: 'seed-olympia-paris',
    title: 'Europe Farewell',
    venueName: "L'Olympia",
    city: 'Paris',
    region: null,
    country: 'France',
    provider: 'manual',
    ticketStatus: 'available',
    ticketUrl: 'https://dice.fm/event/future-paris',
    latitude: 48.86,
    longitude: 2.35,
    timezone: 'Europe/Paris',
    monthsFromNow: 12,
    startTime: '8:30 PM',
  },
];

/**
 * Seeds tour dates for a creator profile.
 * Idempotent — uses onConflictDoNothing to safely backfill.
 */
async function seedTourDatesForProfile(
  db: ReturnType<typeof drizzle>,
  profileId: string
) {
  console.log('    Seeding tour dates...');

  const values = TEST_TOUR_DATES.map(td => ({
    profileId,
    externalId: td.externalId,
    title: td.title,
    venueName: td.venueName,
    city: td.city,
    region: td.region,
    country: td.country,
    provider: td.provider,
    ticketStatus: td.ticketStatus,
    ticketUrl: td.ticketUrl,
    latitude: td.latitude,
    longitude: td.longitude,
    timezone: td.timezone,
    startDate: dateMonthsFromNow(td.monthsFromNow),
    startTime: td.startTime,
  }));

  try {
    await withSeedOperationTimeout(
      db.insert(tourDates).values(values).onConflictDoNothing(),
      15_000,
      'Tour date seed'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`    ⚠ Failed to seed tour dates: ${message}`);
    return;
  }

  console.log(`    ✓ Ensured ${TEST_TOUR_DATES.length} tour dates`);
}

async function seedPublicContactsForProfile(
  db: ReturnType<typeof drizzle>,
  profileId: string
) {
  await db
    .delete(creatorContacts)
    .where(eq(creatorContacts.creatorProfileId, profileId));

  await db.insert(creatorContacts).values([
    {
      creatorProfileId: profileId,
      role: 'bookings',
      personName: 'Maya Reed',
      companyName: 'North Star Touring',
      territories: ['North America'],
      email: 'booking@dualipa.example.com',
      preferredChannel: 'email',
      isActive: true,
      sortOrder: 0,
    },
  ]);

  console.log('    ✓ Ensured public contact coverage');
}

// Sample release data for E2E tests — covers various edge cases
const TEST_RELEASES: TestRelease[] = [
  // Single (1 track)
  {
    title: 'Neon Skyline',
    slug: 'neon-skyline',
    releaseType: 'single',
    releaseDate: new Date('2024-01-15'),
    artworkUrl: DEFAULT_TEST_RELEASE_ARTWORK_URL,
    spotifyUrl: 'https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv',
    totalTracks: 1,
    upc: '191061000001',
    label: 'Neon Records',
    tracks: [
      {
        title: 'Neon Skyline',
        slug: 'neon-skyline',
        trackNumber: 1,
        discNumber: 1,
        durationMs: 214000,
        isrc: 'USAT20000001',
      },
    ],
  },
  // Standard album (10 tracks)
  {
    title: 'Midnight Drive',
    slug: 'midnight-drive',
    releaseType: 'album',
    releaseDate: new Date('2023-11-20'),
    artworkUrl: DEFAULT_TEST_RELEASE_ARTWORK_URL,
    spotifyUrl: 'https://open.spotify.com/album/6JJh8nj3ZPYoEXZwLhRJ7U',
    totalTracks: 10,
    upc: '191061000002',
    label: 'Midnight Music',
    tracks: generateTracks(10),
  },
  // EP (5 tracks)
  {
    title: 'Fading Signals',
    slug: 'fading-signals',
    releaseType: 'ep',
    releaseDate: new Date('2024-03-01'),
    artworkUrl: DEFAULT_TEST_RELEASE_ARTWORK_URL,
    spotifyUrl: 'https://open.spotify.com/album/3LH4d3cOWNNsVw41Gqt2xx',
    totalTracks: 5,
    upc: '191061000003',
    tracks: generateTracks(5),
  },
  // Large album (55 tracks, 3 discs) — tests pagination & multi-disc display
  {
    title: 'The Complete Sessions',
    slug: 'the-complete-sessions',
    releaseType: 'album',
    releaseDate: new Date('2022-06-15'),
    artworkUrl: DEFAULT_TEST_RELEASE_ARTWORK_URL,
    spotifyUrl: 'https://open.spotify.com/album/9XX4d3cOWNNsVw41Gqt2yy',
    totalTracks: 55,
    upc: '191061000004',
    label: 'Anthology Records',
    tracks: generateTracks(55, 3),
  },
  // Compilation (20 tracks, various artists)
  {
    title: 'Best of 2023',
    slug: 'best-of-2023',
    releaseType: 'compilation',
    releaseDate: new Date('2023-12-31'),
    artworkUrl: DEFAULT_TEST_RELEASE_ARTWORK_URL,
    spotifyUrl: 'https://open.spotify.com/album/7ZZ4d3cOWNNsVw41Gqt2zz',
    totalTracks: 20,
    upc: '191061000005',
    label: 'Various Artists',
    tracks: generateTracks(20, 1, { explicitRate: 0.3 }),
  },
  // Single with explicit content
  {
    title: 'Raw Energy',
    slug: 'raw-energy',
    releaseType: 'single',
    releaseDate: new Date('2024-06-01'),
    artworkUrl: DEFAULT_TEST_RELEASE_ARTWORK_URL,
    spotifyUrl: 'https://open.spotify.com/album/1AA4d3cOWNNsVw41Gqt2ww',
    totalTracks: 1,
    tracks: [
      {
        title: 'Raw Energy',
        slug: 'raw-energy',
        trackNumber: 1,
        discNumber: 1,
        durationMs: 198000,
        isrc: 'USAT20000099',
        isExplicit: true,
      },
    ],
  },
  // Future single for public countdown / notify-me coverage
  {
    title: 'Future Glow',
    slug: 'future-glow',
    releaseType: 'single',
    releaseDate: getFutureReleaseDate(),
    artworkUrl: DEFAULT_TEST_RELEASE_ARTWORK_URL,
    spotifyUrl: 'https://open.spotify.com/album/2BB4d3cOWNNsVw41Gqt2aa',
    totalTracks: 1,
    upc: '191061000006',
    label: 'Neon Records',
    tracks: [
      {
        title: 'Future Glow',
        slug: 'future-glow',
        trackNumber: 1,
        discNumber: 1,
        durationMs: 201000,
        isrc: 'USAT20000100',
      },
    ],
  },
];

/**
 * Seeds releases, tracks, and provider links for a creator profile.
 * Handles partial seed states by creating missing releases and provider links.
 * Includes edge cases: large albums (55 tracks), multi-disc, EPs, compilations.
 */
async function seedReleasesForProfile(
  db: ReturnType<typeof drizzle>,
  profileId: string
) {
  console.log('    Seeding releases for E2E user...');

  for (const provider of REQUIRED_PUBLIC_QA_PROVIDERS) {
    await db.insert(providers).values(provider).onConflictDoNothing();
  }

  // Get existing releases with their slugs to handle partial seed states
  const existingReleases = await db
    .select({ id: discogReleases.id, slug: discogReleases.slug })
    .from(discogReleases)
    .where(eq(discogReleases.creatorProfileId, profileId));

  // Build a map of existing releases by slug
  const existingBySlug = new Map(
    existingReleases.map(release => [release.slug, release.id])
  );

  async function ensureRelease(values: SeededReleaseValues) {
    const [release] = await db
      .insert(discogReleases)
      .values(values)
      .onConflictDoUpdate({
        target: [discogReleases.creatorProfileId, discogReleases.slug],
        set: { ...values, updatedAt: new Date() },
      })
      .returning({ id: discogReleases.id });

    return release.id;
  }

  for (const release of TEST_RELEASES) {
    let releaseId = existingBySlug.get(release.slug);

    // Create release if it doesn't exist
    if (!releaseId) {
      releaseId = await ensureRelease({
        creatorProfileId: profileId,
        title: release.title,
        slug: release.slug,
        releaseType: release.releaseType,
        releaseDate: release.releaseDate,
        artworkUrl: release.artworkUrl,
        totalTracks: release.totalTracks,
        upc: release.upc,
        label: release.label,
        sourceType: 'manual',
      });
      console.log(
        `    ✓ Created release: ${release.title} (${release.releaseType}, ${release.totalTracks} tracks)`
      );
      existingBySlug.set(release.slug, releaseId);
    } else {
      console.log(`    ✓ Release exists: ${release.title}`);
    }

    // Add Spotify provider link with upsert behavior (onConflictDoNothing)
    await db
      .insert(providerLinks)
      .values({
        providerId: 'spotify',
        ownerType: 'release',
        releaseId,
        url: release.spotifyUrl,
        isPrimary: true,
        sourceType: 'manual',
      })
      .onConflictDoNothing();

    if (release.slug === 'neon-skyline') {
      await db
        .insert(providerLinks)
        .values([
          {
            providerId: 'tiktok_sound',
            ownerType: 'release',
            releaseId,
            url: 'https://www.tiktok.com/music/Neon-Skyline-7357000000000000001',
            isPrimary: false,
            sourceType: 'manual',
          },
          {
            providerId: 'instagram_reels',
            ownerType: 'release',
            releaseId,
            url: 'https://www.instagram.com/reels/audio/7357000000000000001/',
            isPrimary: false,
            sourceType: 'manual',
          },
          {
            providerId: 'youtube_shorts',
            ownerType: 'release',
            releaseId,
            url: 'https://www.youtube.com/source/7357000000000000001/shorts',
            isPrimary: false,
            sourceType: 'manual',
          },
        ])
        .onConflictDoNothing();
    }

    // Seed tracks if provided
    if (release.tracks && release.tracks.length > 0) {
      await seedTracksForRelease(db, releaseId, profileId, release.tracks);
    }

    console.log(`    ✓ Ensured Spotify link for ${release.title}`);
  }

  const promoReleaseId = existingBySlug.get('neon-skyline');
  if (promoReleaseId) {
    try {
      await db
        .insert(promoDownloads)
        .values({
          creatorProfileId: profileId,
          releaseId: promoReleaseId,
          title: 'Neon Skyline Radio Edit',
          slug: 'neon-skyline-radio-edit',
          description: 'Deterministic promo download fixture for public QA.',
          fileUrl: 'fixtures/promo-downloads/neon-skyline-radio-edit.mp3',
          fileName: 'neon-skyline-radio-edit.mp3',
          fileMimeType: 'audio/mpeg',
          fileSizeBytes: 4_600_000,
          artworkUrl: DEFAULT_TEST_RELEASE_ARTWORK_URL,
          isActive: true,
          position: 0,
          metadata: { fixture: true },
        })
        .onConflictDoNothing();
      console.log('    ✓ Ensured promo download fixture for Neon Skyline');
    } catch (error) {
      if (isMissingPromoDownloadsRelationError(error)) {
        console.warn(
          `    ⚠ promo_downloads is missing; skipping promo download fixture: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      } else {
        throw error;
      }
    }
  }

  console.log('    ✓ Releases seeding complete');
}

/**
 * Seeds tracks for a release. Idempotent — uses onConflictDoNothing to
 * safely backfill missing tracks from partial prior seeds.
 */
async function seedTracksForRelease(
  db: ReturnType<typeof drizzle>,
  releaseId: string,
  profileId: string,
  tracks: TestTrack[]
) {
  const trackValues = tracks.map(track => ({
    releaseId,
    creatorProfileId: profileId,
    title: track.title,
    slug: track.slug,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber,
    durationMs: track.durationMs,
    isrc: track.isrc ?? null,
    isExplicit: track.isExplicit ?? false,
    sourceType: 'manual' as const,
  }));

  await db.insert(discogTracks).values(trackValues).onConflictDoNothing();
  console.log(`      ✓ Ensured ${tracks.length} tracks`);
}

export async function seedTestData(options: SeedTestDataOptions = {}) {
  console.log('🌱 Seeding test data for E2E smoke tests...');

  const { DATABASE_URL: databaseUrl } = getSeedEnv();
  if (!databaseUrl) {
    console.warn('⚠ DATABASE_URL/DATABASE_URL_DIRECT not set, skipping seed');
    return { success: false, reason: 'no_database_url' };
  }

  // Use Neon HTTP driver (same as the app) instead of WebSocket driver
  // This ensures we write to the same connection pool the app reads from
  const sql = neon(databaseUrl);
  const db = drizzle(sql, { schema });
  const seedRetryOptions = {
    attempts: process.env.CI ? 4 : 2,
    initialDelayMs: 1_500,
    label: 'E2E seed database access',
  } as const;

  try {
    await withSeedDatabaseRetry(async () => {
      if (!options.publicProfilesOnly) {
        // Create E2E test user (for authenticated dashboard tests)
        // These values come from the setup script: scripts/setup-e2e-users.ts
        const {
          E2E_CLERK_USER_ID: configuredE2EClerkUserId,
          E2E_CLERK_USER_USERNAME,
        } = getSeedEnv();
        const E2E_EMAIL = normalizeEmail(
          E2E_CLERK_USER_USERNAME || 'e2e@jov.ie'
        );
        const isAllowlistedE2EEmail = isAllowlistedE2ESeedEmail(E2E_EMAIL);
        const E2E_USERNAME = 'e2e-test-user';
        const E2E_CLERK_USER_ID = isAllowlistedE2EEmail
          ? await resolveSeedUserClerkId(
              E2E_EMAIL,
              configuredE2EClerkUserId ?? getSeedDeterministicClerkId(E2E_EMAIL)
            )
          : null;

        if (E2E_CLERK_USER_ID) {
          // Keep the Playwright auth-bypass path aligned with the Clerk user ID
          // actually seeded into the database for this run.
          process.env.E2E_CLERK_USER_ID = E2E_CLERK_USER_ID;
        }

        if (!isAllowlistedE2EEmail) {
          console.warn(
            `  ⚠ Refusing to seed privileged E2E user for non-allowlisted email ${E2E_EMAIL}`
          );
        } else if (!E2E_CLERK_USER_ID) {
          console.log(
            '  ⚠ E2E_CLERK_USER_ID not set, skipping E2E user creation'
          );
          console.log(
            '    Run scripts/setup-e2e-users.ts to create test users in Clerk'
          );
        } else {
          console.log('  Creating E2E test user...');
          try {
            const { id: userId, previousClerkId } = await ensureUser(db, {
              clerkId: E2E_CLERK_USER_ID,
              email: E2E_EMAIL,
              name: 'E2E Test',
              userStatus: 'active',
              isAdmin: true,
            });
            console.log(
              `    ✓ Ensured E2E user with admin privileges (ID: ${userId})`
            );
            if (previousClerkId) {
              console.log(
                `    ✓ Adopted existing E2E user from stale Clerk ID ${previousClerkId} to ${E2E_CLERK_USER_ID}`
              );
            }

            const profileId = await ensureCreatorProfile(db, {
              userId,
              username: E2E_USERNAME,
              usernameNormalized: E2E_USERNAME.toLowerCase(),
              displayName: 'E2E Test User',
              bio: 'Automated test user',
              avatarUrl: DEFAULT_TEST_AVATAR_URL,
              spotifyUrl: null,
              appleMusicUrl: null,
              appleMusicId: null,
              youtubeMusicId: null,
              deezerId: null,
              tidalId: null,
              soundcloudId: null,
              creatorType: 'artist',
              isPublic: true,
              isVerified: false,
              isClaimed: true,
              ingestionStatus: 'idle',
              onboardingCompletedAt: new Date(),
            });

            await setActiveProfile(db, userId, profileId);

            console.log(
              `    ✓ Ensured E2E profile ${E2E_USERNAME} (ID: ${profileId})`
            );
            console.log(`    ✓ Set active profile for E2E user`);

            await seedReleasesForProfile(db, profileId);
            await seedTourDatesForProfile(db, profileId);

            const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } =
              getSeedEnv();
            if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
              try {
                const redis = new Redis({
                  url: UPSTASH_REDIS_REST_URL,
                  token: UPSTASH_REDIS_REST_TOKEN,
                });
                const clerkIdsToInvalidate = [
                  previousClerkId,
                  E2E_CLERK_USER_ID,
                ].filter((clerkId): clerkId is string => Boolean(clerkId));

                let deletedCount = 0;
                for (const clerkId of clerkIdsToInvalidate) {
                  const proxyStateCacheKey = `proxy:user-state:${clerkId}`;
                  const adminRoleCacheKey = `admin:role:${clerkId}`;
                  deletedCount += await redis.del(proxyStateCacheKey);
                  deletedCount += await redis.del(adminRoleCacheKey);
                }

                console.log(
                  `    ✓ Invalidated proxy/admin caches for E2E user (${deletedCount} key(s) across ${clerkIdsToInvalidate.length} Clerk ID(s))`
                );
              } catch (error) {
                console.warn(
                  '    ⚠ Failed to invalidate proxy state cache for E2E user:',
                  error
                );
              }
            }
          } catch (error) {
            if (!isMissingActiveProfileIdColumn(error)) {
              throw error;
            }

            console.warn(
              '    ⚠ Skipping E2E user creation because the preview database is missing users.active_profile_id'
            );
          }
        }
      }
    }, seedRetryOptions);

    await withSeedDatabaseRetry(async () => {
      // Create test profiles
      for (const profile of TEST_PROFILES) {
        console.log(`  Creating profile: ${profile.username}`);

        // For dualipa, include real multi-DSP IDs so E2E tests can verify multi-DSP rendering
        const dspFields =
          profile.username === 'dualipa'
            ? {
                appleMusicId: '1031397873',
                appleMusicUrl:
                  'https://music.apple.com/us/artist/dua-lipa/1031397873',
                deezerId: '13206246',
                tidalId: '7551163',
                youtubeMusicId: 'UC-J-KZfRV8c13fOCkhXdLiQ',
                soundcloudId: 'dualipa',
              }
            : {
                appleMusicId: null,
                appleMusicUrl: null,
                deezerId: null,
                tidalId: null,
                youtubeMusicId: null,
                soundcloudId: null,
              };

        let ownerUserId: string | null = null;
        if (profile.username === 'dualipa') {
          const publicOwnerEmail = normalizeEmail('dualipa-public@jov.ie');
          const { id: userId } = await ensureUser(db, {
            clerkId: getSeedDeterministicClerkId(publicOwnerEmail),
            email: publicOwnerEmail,
            name: profile.displayName,
            userStatus: 'active',
            isAdmin: false,
          });

          await db
            .update(users)
            .set({
              isPro: true,
              plan: 'pro',
              updatedAt: new Date(),
            })
            .where(eq(users.id, userId));

          ownerUserId = userId;
        }

        const createdProfileId = await ensureCreatorProfile(db, {
          userId: ownerUserId,
          username: profile.username,
          usernameNormalized: profile.username.toLowerCase(),
          displayName: profile.displayName,
          bio: profile.bio,
          spotifyUrl: profile.spotifyUrl || null,
          avatarUrl: profile.avatarUrl || null,
          creatorType: 'artist',
          isPublic: true,
          isVerified: false,
          isClaimed: ownerUserId !== null,
          ingestionStatus: 'idle',
          onboardingCompletedAt: null,
          ...dspFields,
        });

        if (ownerUserId) {
          await ensureUserProfileClaim(db, ownerUserId, createdProfileId);
        }

        console.log(
          `    ✓ Ensured profile ${profile.username} (ID: ${createdProfileId})`
        );

        // Add a sample social link
        if (profile.spotifyUrl) {
          await ensureSocialLink(db, {
            creatorProfileId: createdProfileId,
            platform: 'spotify',
            platformType: 'music_streaming',
            url: profile.spotifyUrl,
            displayText: 'Listen on Spotify',
            isActive: true,
            sortOrder: 1,
            state: 'active',
          });
          console.log(`    ✓ Added Spotify link for ${profile.username}`);
        }

        // Add multi-DSP social links for dualipa so E2E tests verify multi-DSP rendering
        if (profile.username === 'dualipa') {
          const dualipaSocialLinks = [
            {
              platform: 'apple_music',
              platformType: 'music_streaming' as const,
              url: 'https://music.apple.com/us/artist/dua-lipa/1031397873',
              displayText: 'Listen on Apple Music',
              sortOrder: 2,
            },
            {
              platform: 'instagram',
              platformType: 'social' as const,
              url: 'https://instagram.com/dualipa',
              displayText: 'Instagram',
              sortOrder: 3,
            },
            {
              platform: 'tiktok',
              platformType: 'social' as const,
              url: 'https://tiktok.com/@dualipa',
              displayText: 'TikTok',
              sortOrder: 4,
            },
            {
              platform: 'youtube',
              platformType: 'video' as const,
              url: 'https://youtube.com/channel/UC-J-KZfRV8c13fOCkhXdLiQ',
              displayText: 'YouTube',
              sortOrder: 5,
            },
          ];
          for (const link of dualipaSocialLinks) {
            await ensureSocialLink(db, {
              creatorProfileId: createdProfileId,
              platform: link.platform,
              platformType: link.platformType,
              url: link.url,
              displayText: link.displayText,
              isActive: true,
              sortOrder: link.sortOrder,
              state: 'active',
            });
          }
          console.log(
            `    ✓ Added ${dualipaSocialLinks.length} multi-DSP social links for dualipa`
          );
        }

        // Add tour dates for dualipa to test public touring display
        if (profile.username === 'dualipa') {
          await seedReleasesForProfile(db, createdProfileId);
          await seedTourDatesForProfile(db, createdProfileId);
          await seedPublicContactsForProfile(db, createdProfileId);
        }

        // Add Venmo payment link for tipping tests
        if (profile.username === 'testartist') {
          await ensureSocialLink(db, {
            creatorProfileId: createdProfileId,
            platform: 'venmo',
            platformType: 'payment',
            url: 'https://venmo.com/testartist',
            displayText: 'Tip on Venmo',
            isActive: true,
            sortOrder: 2,
            state: 'active',
          });
          console.log(`    ✓ Added Venmo link for ${profile.username}`);
        }

        // Invalidate Redis cache for this profile to ensure fresh data
        // Only attempt if Redis credentials are available
        const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } =
          getSeedEnv();
        if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
          try {
            const redis = new Redis({
              url: UPSTASH_REDIS_REST_URL,
              token: UPSTASH_REDIS_REST_TOKEN,
            });
            const cacheKey = `profile:data:${profile.username.toLowerCase()}`;

            // Verify cache exists before deletion
            const beforeCache = await redis.get(cacheKey);
            const deletedCount = await redis.del(cacheKey);

            // Verify cache was actually deleted
            const afterCache = await redis.get(cacheKey);

            console.log(
              `    ✓ Invalidated Redis cache for ${profile.username} (deleted ${deletedCount} key(s), before: ${beforeCache ? 'EXISTS' : 'NULL'}, after: ${afterCache ? 'EXISTS' : 'NULL'})`
            );
          } catch (error) {
            console.warn(
              `    ⚠ Failed to invalidate Redis cache for ${profile.username}:`,
              error
            );
          }
        }
      }
    }, seedRetryOptions);

    console.log('✅ Test data seeding complete');
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to seed test data:', error);
    throw error;
  }
}

// Allow running directly via ts-node or similar
if (require.main === module) {
  seedTestData()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}
