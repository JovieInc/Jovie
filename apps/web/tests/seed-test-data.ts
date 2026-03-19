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

// Use the same HTTP driver as the app for consistency
const {
  users,
  creatorProfiles,
  socialLinks,
  discogReleases,
  discogTracks,
  providerLinks,
  tourDates,
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

const TEST_PROFILES: TestProfile[] = [
  {
    username: 'dualipa',
    displayName: 'Dua Lipa',
    bio: 'Pop artist and songwriter',
    spotifyUrl: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
    avatarUrl:
      'https://i.scdn.co/image/ab6761610000e5eb0bae7cfd3fb1b2866db6bc8d',
  },
  {
    username: 'taylorswift',
    displayName: 'Taylor Swift',
    bio: 'Singer-songwriter',
    spotifyUrl: 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02',
    avatarUrl:
      'https://i.scdn.co/image/ab6761610000e5eb5a00969a4698c3132a15fbb0',
  },
  {
    username: 'testartist',
    displayName: 'Test Artist',
    bio: 'Test artist for E2E tipping tests',
    spotifyUrl: 'https://open.spotify.com/artist/test',
    avatarUrl:
      'https://i.scdn.co/image/ab6761610000e5eb0bae7cfd3fb1b2866db6bc8d',
  },
];

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

  for (const td of TEST_TOUR_DATES) {
    await db
      .insert(tourDates)
      .values({
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
      })
      .onConflictDoNothing();
  }

  console.log(`    ✓ Ensured ${TEST_TOUR_DATES.length} tour dates`);
}

// Sample release data for E2E tests — covers various edge cases
const TEST_RELEASES: TestRelease[] = [
  // Single (1 track)
  {
    title: 'Neon Skyline',
    slug: 'neon-skyline',
    releaseType: 'single',
    releaseDate: new Date('2024-01-15'),
    artworkUrl:
      'https://i.scdn.co/image/ab67616d00001e02ff9ca10b55ce82ae553c8228',
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
    artworkUrl:
      'https://i.scdn.co/image/ab67616d00001e02e8b066f70c206551210d902b',
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
    artworkUrl:
      'https://i.scdn.co/image/ab67616d00001e02ff9ca10b55ce82ae553c8228',
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
    artworkUrl:
      'https://i.scdn.co/image/ab67616d00001e02e8b066f70c206551210d902b',
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
    artworkUrl:
      'https://i.scdn.co/image/ab67616d00001e02ff9ca10b55ce82ae553c8228',
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
    artworkUrl:
      'https://i.scdn.co/image/ab67616d00001e02e8b066f70c206551210d902b',
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

  // Get existing releases with their slugs to handle partial seed states
  const existingReleases = await db
    .select({ id: discogReleases.id, slug: discogReleases.slug })
    .from(discogReleases)
    .where(eq(discogReleases.creatorProfileId, profileId));

  // Build a map of existing releases by slug
  const existingBySlug = new Map(
    existingReleases.map(release => [release.slug, release.id])
  );

  for (const release of TEST_RELEASES) {
    let releaseId = existingBySlug.get(release.slug);

    // Create release if it doesn't exist
    if (!releaseId) {
      const [createdRelease] = await db
        .insert(discogReleases)
        .values({
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
        })
        .returning({ id: discogReleases.id });

      releaseId = createdRelease.id;
      console.log(
        `    ✓ Created release: ${release.title} (${release.releaseType}, ${release.totalTracks} tracks)`
      );
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

    // Seed tracks if provided
    if (release.tracks && release.tracks.length > 0) {
      await seedTracksForRelease(db, releaseId, profileId, release.tracks);
    }

    console.log(`    ✓ Ensured Spotify link for ${release.title}`);
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

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('⚠ DATABASE_URL not set, skipping seed');
    return { success: false, reason: 'no_database_url' };
  }

  // Use Neon HTTP driver (same as the app) instead of WebSocket driver
  // This ensures we write to the same connection pool the app reads from
  const sql = neon(databaseUrl);
  const db = drizzle(sql, { schema });

  try {
    if (!options.publicProfilesOnly) {
      // Create E2E test user (for authenticated dashboard tests)
      // These values come from the setup script: scripts/setup-e2e-users.ts
      const E2E_CLERK_USER_ID = process.env.E2E_CLERK_USER_ID;
      const E2E_EMAIL = process.env.E2E_CLERK_USER_USERNAME || 'e2e@jov.ie';
      const E2E_USERNAME = 'e2e-test-user';

      if (!E2E_CLERK_USER_ID) {
        console.log(
          '  ⚠ E2E_CLERK_USER_ID not set, skipping E2E user creation'
        );
        console.log(
          '    Run scripts/setup-e2e-users.ts to create test users in Clerk'
        );
      } else {
        console.log('  Creating E2E test user...');
        const [existingUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, E2E_CLERK_USER_ID))
          .limit(1);

        if (!existingUser) {
          // Create the user record with admin privileges for E2E tests
          const [createdUser] = await db
            .insert(users)
            .values({
              clerkId: E2E_CLERK_USER_ID,
              email: E2E_EMAIL,
              name: 'E2E Test',
              userStatus: 'active', // Active user with completed onboarding
              isAdmin: true, // Grant admin for E2E admin tests
            })
            .returning({ id: users.id });

          console.log(
            `    ✓ Created E2E user with admin privileges (ID: ${createdUser.id})`
          );

          // Create a creator profile for the E2E user
          const [createdProfile] = await db
            .insert(creatorProfiles)
            .values({
              userId: createdUser.id,
              username: E2E_USERNAME,
              usernameNormalized: E2E_USERNAME.toLowerCase(),
              displayName: 'E2E Test User',
              bio: 'Automated test user',
              creatorType: 'artist',
              isPublic: true,
              isVerified: false,
              isClaimed: true,
              ingestionStatus: 'idle',
              onboardingCompletedAt: new Date(), // Mark onboarding as complete
            })
            .returning({ id: creatorProfiles.id });

          console.log(
            `    ✓ Created E2E profile ${E2E_USERNAME} (ID: ${createdProfile.id})`
          );

          await seedReleasesForProfile(db, createdProfile.id);
          await seedTourDatesForProfile(db, createdProfile.id);
        } else {
          await db
            .update(users)
            .set({ isAdmin: true, name: 'E2E Test' })
            .where(eq(users.clerkId, E2E_CLERK_USER_ID));
          console.log('    ✓ E2E test user exists, ensured admin privileges');

          const [existingProfile] = await db
            .select({ id: creatorProfiles.id })
            .from(creatorProfiles)
            .where(
              eq(creatorProfiles.usernameNormalized, E2E_USERNAME.toLowerCase())
            )
            .limit(1);

          if (existingProfile) {
            await seedReleasesForProfile(db, existingProfile.id);
            await seedTourDatesForProfile(db, existingProfile.id);
          }
        }
      }
    }

    // Create test profiles
    for (const profile of TEST_PROFILES) {
      console.log(`  Creating profile: ${profile.username}`);

      // Check if profile already exists and delete it to ensure clean state
      const [existing] = await db
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(
          eq(creatorProfiles.usernameNormalized, profile.username.toLowerCase())
        )
        .limit(1);

      if (existing) {
        console.log(
          `    → Profile ${profile.username} exists, recreating with correct values...`
        );
        // Delete existing profile (social links will cascade delete)
        await db
          .delete(creatorProfiles)
          .where(eq(creatorProfiles.id, existing.id));
      }

      // Create the creator profile using Drizzle ORM insert to ensure proper boolean handling
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
          : {};

      const [createdProfile] = await db
        .insert(creatorProfiles)
        .values({
          username: profile.username,
          usernameNormalized: profile.username.toLowerCase(),
          displayName: profile.displayName,
          bio: profile.bio,
          spotifyUrl: profile.spotifyUrl || null,
          avatarUrl: profile.avatarUrl || null,
          creatorType: 'artist',
          isPublic: true,
          isVerified: false,
          isClaimed: false,
          ingestionStatus: 'idle',
          ...dspFields,
        })
        .returning({ id: creatorProfiles.id });

      console.log(
        `    ✓ Created profile ${profile.username} (ID: ${createdProfile.id})`
      );

      // Add a sample social link
      if (profile.spotifyUrl) {
        await db.insert(socialLinks).values({
          creatorProfileId: createdProfile.id,
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
          await db.insert(socialLinks).values({
            creatorProfileId: createdProfile.id,
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
        await seedTourDatesForProfile(db, createdProfile.id);
      }

      // Add Venmo payment link for tipping tests
      if (profile.username === 'testartist') {
        await db.insert(socialLinks).values({
          creatorProfileId: createdProfile.id,
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
      if (
        process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN
      ) {
        try {
          const redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
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
