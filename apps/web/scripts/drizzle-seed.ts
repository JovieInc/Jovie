#!/usr/bin/env -S tsx

/**
 * Drizzle Database Seed Script
 * Seeds the database with comprehensive demo data using Drizzle ORM and Neon
 */

import { neon } from '@neondatabase/serverless';
import { config as dotenvConfig } from 'dotenv';
import { sql as drizzleSql } from 'drizzle-orm';
import {
  type NeonHttpDatabase,
  drizzle as neonDrizzle,
} from 'drizzle-orm/neon-http';
import * as schema from '@/lib/db/schema';
import {
  audienceMembers,
  clickEvents,
  creatorContacts,
  creatorProfiles,
  discogReleases,
  discogTracks,
  type NewProvider,
  notificationSubscriptions,
  providerLinks,
  providers,
  scraperConfigs,
  smartLinkTargets,
  socialAccounts,
  socialLinks,
  tips,
  userSettings,
  users,
} from '@/lib/db/schema';

// Load .env.local first to override defaults, then fallback to .env
dotenvConfig({ path: '.env.local', override: true });
dotenvConfig();

if (process.env.ALLOW_DB_SEED !== '1') {
  console.error('❌ db:seed is disabled. Seed profiles have been removed.');
  process.exit(1);
}

// URL pattern for Neon special URL format
const NEON_PLUS_PATTERN = /(postgres)(|ql)(\+neon)(.*)/;

const DATABASE_URL: string = process.env.DATABASE_URL ?? '';
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
  process.exit(1);
}

type SeedDB = NeonHttpDatabase<typeof schema>;
let db: SeedDB;
const closeDb = async (): Promise<void> => {
  // Neon HTTP driver has no persistent connection to close
};

function normalizeForNeon(url: string): string {
  // strip "+neon" suffix if present
  return url.replace(NEON_PLUS_PATTERN, 'postgres$2$4');
}

function logConnInfo(url: string) {
  try {
    const u = new URL(url);
    const redacted = `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`;
    console.log(`🔌 DB target: ${redacted}`);
  } catch {
    /* ignore */
  }
}

async function initDb(): Promise<void> {
  const neonUrl = normalizeForNeon(DATABASE_URL);
  logConnInfo(neonUrl);

  const sqlClient = neon(neonUrl);
  db = neonDrizzle(sqlClient, { schema });

  // Verify connection
  await db.execute(drizzleSql`SELECT 1`);
}

// =============================================================================
// ARTIST SEED DATA
// =============================================================================

type ArtistSeed = {
  clerkId: string;
  email: string;
  profile: {
    username: string;
    displayName: string;
    bio?: string;
    avatarUrl?: string;
    spotifyUrl?: string;
    appleMusicUrl?: string;
    youtubeUrl?: string;
    creatorType?: 'artist' | 'podcaster' | 'influencer' | 'creator';
    isPublic?: boolean;
    isVerified?: boolean;
    isFeatured?: boolean;
  };
  socialLinks: Array<{
    platform: string;
    platformType: 'social' | 'listen' | 'tip' | 'other';
    url: string;
    displayText?: string;
    sortOrder?: number;
  }>;
  discography?: DiscographySeed[];
  contacts?: ContactSeed[];
};

type DiscographySeed = {
  title: string;
  slug: string;
  releaseType: 'single' | 'ep' | 'album' | 'compilation' | 'live' | 'mixtape';
  releaseDate: Date;
  label?: string;
  upc?: string;
  isExplicit?: boolean;
  artworkUrl?: string;
  tracks: TrackSeed[];
};

type TrackSeed = {
  title: string;
  slug: string;
  durationMs: number;
  trackNumber: number;
  discNumber?: number;
  isExplicit?: boolean;
  isrc?: string;
  previewUrl?: string;
};

type ContactSeed = {
  role:
    | 'bookings'
    | 'management'
    | 'press_pr'
    | 'brand_partnerships'
    | 'fan_general'
    | 'other';
  personName?: string;
  companyName?: string;
  territories?: string[];
  email?: string;
  phone?: string;
  preferredChannel?: 'email' | 'phone';
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-/g, ''); // compact for socials (e.g., the1975)
}

function _slugifyWithDashes(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function makeArtist(
  name: string,
  options: {
    isVerified?: boolean;
    isFeatured?: boolean;
    creatorType?: 'artist' | 'podcaster' | 'influencer' | 'creator';
    discography?: DiscographySeed[];
    contacts?: ContactSeed[];
  } = {}
): ArtistSeed {
  const username = slugify(name);
  const handle = username; // reuse for socials

  return {
    clerkId: `seed_${username}`,
    email: `${username}@example.com`,
    profile: {
      username,
      displayName: name,
      bio: options.isVerified
        ? `${name} - Verified artist and creator.`
        : `Official ${name} demo profile for development and testing.`,
      creatorType: options.creatorType ?? 'artist',
      isPublic: true,
      isVerified: options.isVerified ?? false,
      isFeatured: options.isFeatured ?? false,
      spotifyUrl: `https://open.spotify.com/artist/demo-${username}`,
      appleMusicUrl: `https://music.apple.com/artist/demo-${username}`,
      youtubeUrl: `https://youtube.com/@${handle}`,
    },
    socialLinks: [
      {
        platform: 'Instagram',
        platformType: 'social',
        url: `https://instagram.com/${handle}`,
        displayText: `@${handle}`,
        sortOrder: 1,
      },
      {
        platform: 'Twitter',
        platformType: 'social',
        url: `https://twitter.com/${handle}`,
        displayText: `@${handle}`,
        sortOrder: 2,
      },
      {
        platform: 'TikTok',
        platformType: 'social',
        url: `https://tiktok.com/@${handle}`,
        displayText: `@${handle}`,
        sortOrder: 3,
      },
      {
        platform: 'YouTube',
        platformType: 'social',
        url: `https://youtube.com/@${handle}`,
        displayText: 'YouTube Channel',
        sortOrder: 4,
      },
      {
        platform: 'Spotify',
        platformType: 'listen',
        url: `https://open.spotify.com/artist/demo-${username}`,
        displayText: 'Listen on Spotify',
        sortOrder: 5,
      },
      {
        platform: 'Apple Music',
        platformType: 'listen',
        url: `https://music.apple.com/artist/demo-${username}`,
        displayText: 'Listen on Apple Music',
        sortOrder: 6,
      },
      {
        platform: 'Venmo',
        platformType: 'tip',
        url: `https://venmo.com/${handle}`,
        displayText: 'Tip on Venmo',
        sortOrder: 7,
      },
    ],
    discography: options.discography,
    contacts: options.contacts,
  };
}

// Helper to generate random date within a range
function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

// Sample discographies for featured artists
const timWhiteDiscography: DiscographySeed[] = [
  {
    title: 'Midnight Sessions',
    slug: 'midnight-sessions',
    releaseType: 'album',
    releaseDate: new Date('2024-03-15'),
    label: 'Indie Records',
    upc: '123456789012',
    isExplicit: false,
    artworkUrl: 'https://picsum.photos/seed/midnight/500/500',
    tracks: [
      {
        title: 'Intro',
        slug: 'intro',
        durationMs: 90000,
        trackNumber: 1,
        isrc: 'USRC12400001',
      },
      {
        title: 'Neon Lights',
        slug: 'neon-lights',
        durationMs: 234000,
        trackNumber: 2,
        isrc: 'USRC12400002',
      },
      {
        title: 'City Dreams',
        slug: 'city-dreams',
        durationMs: 198000,
        trackNumber: 3,
        isrc: 'USRC12400003',
      },
      {
        title: 'Lost in Time',
        slug: 'lost-in-time',
        durationMs: 256000,
        trackNumber: 4,
        isrc: 'USRC12400004',
      },
      {
        title: 'Echoes',
        slug: 'echoes',
        durationMs: 312000,
        trackNumber: 5,
        isrc: 'USRC12400005',
      },
      {
        title: 'Midnight Drive',
        slug: 'midnight-drive',
        durationMs: 245000,
        trackNumber: 6,
        isrc: 'USRC12400006',
      },
      {
        title: 'Fading Away',
        slug: 'fading-away',
        durationMs: 287000,
        trackNumber: 7,
        isrc: 'USRC12400007',
      },
      {
        title: 'New Horizons',
        slug: 'new-horizons',
        durationMs: 334000,
        trackNumber: 8,
        isrc: 'USRC12400008',
      },
    ],
  },
  {
    title: 'Summer Vibes',
    slug: 'summer-vibes',
    releaseType: 'ep',
    releaseDate: new Date('2024-06-21'),
    label: 'Indie Records',
    upc: '123456789013',
    isExplicit: false,
    artworkUrl: 'https://picsum.photos/seed/summer/500/500',
    tracks: [
      {
        title: 'Beach Day',
        slug: 'beach-day',
        durationMs: 198000,
        trackNumber: 1,
        isrc: 'USRC12400009',
      },
      {
        title: 'Sunset Boulevard',
        slug: 'sunset-boulevard',
        durationMs: 223000,
        trackNumber: 2,
        isrc: 'USRC12400010',
      },
      {
        title: 'Ocean Breeze',
        slug: 'ocean-breeze',
        durationMs: 267000,
        trackNumber: 3,
        isrc: 'USRC12400011',
      },
      {
        title: 'Golden Hour',
        slug: 'golden-hour',
        durationMs: 245000,
        trackNumber: 4,
        isrc: 'USRC12400012',
      },
    ],
  },
  {
    title: 'Electric Dreams',
    slug: 'electric-dreams',
    releaseType: 'single',
    releaseDate: new Date('2024-09-01'),
    label: 'Indie Records',
    upc: '123456789014',
    isExplicit: false,
    artworkUrl: 'https://picsum.photos/seed/electric/500/500',
    tracks: [
      {
        title: 'Electric Dreams',
        slug: 'electric-dreams',
        durationMs: 212000,
        trackNumber: 1,
        isrc: 'USRC12400013',
      },
    ],
  },
];

const the1975Discography: DiscographySeed[] = [
  {
    title: 'Notes on a Conditional Form',
    slug: 'notes-on-a-conditional-form',
    releaseType: 'album',
    releaseDate: new Date('2020-05-22'),
    label: 'Dirty Hit',
    upc: '234567890123',
    isExplicit: true,
    artworkUrl: 'https://picsum.photos/seed/notes/500/500',
    tracks: [
      {
        title: 'The 1975',
        slug: 'the-1975',
        durationMs: 275000,
        trackNumber: 1,
        isrc: 'GBUM72000001',
      },
      {
        title: 'People',
        slug: 'people',
        durationMs: 203000,
        trackNumber: 2,
        isExplicit: true,
        isrc: 'GBUM72000002',
      },
      {
        title: 'The End',
        slug: 'the-end',
        durationMs: 223000,
        trackNumber: 3,
        isrc: 'GBUM72000003',
      },
      {
        title: 'Frail State of Mind',
        slug: 'frail-state-of-mind',
        durationMs: 248000,
        trackNumber: 4,
        isrc: 'GBUM72000004',
      },
      {
        title: 'Streaming',
        slug: 'streaming',
        durationMs: 178000,
        trackNumber: 5,
        isrc: 'GBUM72000005',
      },
    ],
  },
  {
    title: 'Me & You Together Song',
    slug: 'me-you-together-song',
    releaseType: 'single',
    releaseDate: new Date('2020-01-16'),
    label: 'Dirty Hit',
    upc: '234567890124',
    isExplicit: false,
    artworkUrl: 'https://picsum.photos/seed/meyou/500/500',
    tracks: [
      {
        title: 'Me & You Together Song',
        slug: 'me-you-together-song',
        durationMs: 238000,
        trackNumber: 1,
        isrc: 'GBUM72000006',
      },
    ],
  },
];

const coldplayDiscography: DiscographySeed[] = [
  {
    title: 'Music of the Spheres',
    slug: 'music-of-the-spheres',
    releaseType: 'album',
    releaseDate: new Date('2021-10-15'),
    label: 'Parlophone',
    upc: '345678901234',
    isExplicit: false,
    artworkUrl: 'https://picsum.photos/seed/spheres/500/500',
    tracks: [
      {
        title: 'Music of the Spheres',
        slug: 'music-of-the-spheres',
        durationMs: 315000,
        trackNumber: 1,
        isrc: 'GBAYE2100001',
      },
      {
        title: 'Higher Power',
        slug: 'higher-power',
        durationMs: 205000,
        trackNumber: 2,
        isrc: 'GBAYE2100002',
      },
      {
        title: 'Humankind',
        slug: 'humankind',
        durationMs: 276000,
        trackNumber: 3,
        isrc: 'GBAYE2100003',
      },
      {
        title: 'Let Somebody Go',
        slug: 'let-somebody-go',
        durationMs: 244000,
        trackNumber: 4,
        isrc: 'GBAYE2100004',
      },
      {
        title: 'My Universe',
        slug: 'my-universe',
        durationMs: 229000,
        trackNumber: 5,
        isrc: 'GBAYE2100005',
      },
    ],
  },
];

const billieDiscography: DiscographySeed[] = [
  {
    title: 'Happier Than Ever',
    slug: 'happier-than-ever',
    releaseType: 'album',
    releaseDate: new Date('2021-07-30'),
    label: 'Darkroom/Interscope',
    upc: '456789012345',
    isExplicit: true,
    artworkUrl: 'https://picsum.photos/seed/happier/500/500',
    tracks: [
      {
        title: 'Getting Older',
        slug: 'getting-older',
        durationMs: 244000,
        trackNumber: 1,
        isrc: 'USUM72100001',
      },
      {
        title: 'I Didnt Change My Number',
        slug: 'i-didnt-change-my-number',
        durationMs: 157000,
        trackNumber: 2,
        isExplicit: true,
        isrc: 'USUM72100002',
      },
      {
        title: 'Billie Bossa Nova',
        slug: 'billie-bossa-nova',
        durationMs: 196000,
        trackNumber: 3,
        isrc: 'USUM72100003',
      },
      {
        title: 'my future',
        slug: 'my-future',
        durationMs: 210000,
        trackNumber: 4,
        isrc: 'USUM72100004',
      },
      {
        title: 'Happier Than Ever',
        slug: 'happier-than-ever',
        durationMs: 298000,
        trackNumber: 5,
        isrc: 'USUM72100005',
      },
    ],
  },
];

const duaLipaDiscography: DiscographySeed[] = [
  {
    title: 'Future Nostalgia',
    slug: 'future-nostalgia',
    releaseType: 'album',
    releaseDate: new Date('2020-03-27'),
    label: 'Warner Records',
    upc: '567890123456',
    isExplicit: false,
    artworkUrl: 'https://picsum.photos/seed/future/500/500',
    tracks: [
      {
        title: 'Future Nostalgia',
        slug: 'future-nostalgia',
        durationMs: 188000,
        trackNumber: 1,
        isrc: 'GBAHT2000001',
      },
      {
        title: 'Dont Start Now',
        slug: 'dont-start-now',
        durationMs: 183000,
        trackNumber: 2,
        isrc: 'GBAHT2000002',
      },
      {
        title: 'Cool',
        slug: 'cool',
        durationMs: 209000,
        trackNumber: 3,
        isrc: 'GBAHT2000003',
      },
      {
        title: 'Physical',
        slug: 'physical',
        durationMs: 194000,
        trackNumber: 4,
        isrc: 'GBAHT2000004',
      },
      {
        title: 'Levitating',
        slug: 'levitating',
        durationMs: 203000,
        trackNumber: 5,
        isrc: 'GBAHT2000005',
      },
    ],
  },
];

// Standard contacts template
const standardContacts: ContactSeed[] = [
  {
    role: 'management',
    personName: 'Sarah Johnson',
    companyName: 'Artist Management Co.',
    territories: ['US', 'CA', 'GB'],
    email: 'management@example.com',
    preferredChannel: 'email',
  },
  {
    role: 'bookings',
    personName: 'Mike Chen',
    companyName: 'Live Nation Touring',
    territories: ['US'],
    email: 'bookings@example.com',
    phone: '+1-555-0123',
    preferredChannel: 'email',
  },
  {
    role: 'press_pr',
    personName: 'Amanda White',
    companyName: 'PR Solutions',
    territories: ['US', 'GB', 'AU'],
    email: 'press@example.com',
    preferredChannel: 'email',
  },
];

const ARTISTS: ArtistSeed[] = [
  makeArtist('Tim White', {
    isVerified: true,
    isFeatured: true,
    discography: timWhiteDiscography,
    contacts: standardContacts,
  }),
  makeArtist('The 1975', {
    isVerified: true,
    isFeatured: true,
    discography: the1975Discography,
    contacts: standardContacts,
  }),
  makeArtist('Coldplay', {
    isVerified: true,
    isFeatured: true,
    discography: coldplayDiscography,
    contacts: standardContacts,
  }),
  makeArtist('Billie Eilish', {
    isVerified: true,
    isFeatured: true,
    discography: billieDiscography,
    contacts: standardContacts,
  }),
  makeArtist('Dua Lipa', {
    isVerified: true,
    isFeatured: true,
    discography: duaLipaDiscography,
    contacts: standardContacts,
  }),
  makeArtist('John Mayer', { isVerified: false, isFeatured: false }),
  makeArtist('Lady Gaga', { isVerified: false, isFeatured: false }),
  makeArtist('Ed Sheeran', { isVerified: false, isFeatured: false }),
  makeArtist('Taylor Swift', { isVerified: false, isFeatured: false }),
  makeArtist('Maneskin', { isVerified: false, isFeatured: false }),
  // Additional diverse creator types
  makeArtist('Tech Talk Daily', {
    creatorType: 'podcaster',
    isVerified: true,
    isFeatured: true,
  }),
  makeArtist('Fitness With Emma', {
    creatorType: 'influencer',
    isVerified: false,
    isFeatured: false,
  }),
  makeArtist('Creative Corner', {
    creatorType: 'creator',
    isVerified: false,
    isFeatured: false,
  }),
];

// =============================================================================
// PROVIDER SEED DATA
// =============================================================================

const PROVIDER_SEED: NewProvider[] = [
  {
    id: 'spotify',
    displayName: 'Spotify',
    kind: 'music_streaming',
    baseUrl: 'https://open.spotify.com',
    isActive: true,
    metadata: { iconColor: '#1DB954', priority: 1 },
  },
  {
    id: 'apple_music',
    displayName: 'Apple Music',
    kind: 'music_streaming',
    baseUrl: 'https://music.apple.com',
    isActive: true,
    metadata: { iconColor: '#FA243C', priority: 2 },
  },
  {
    id: 'youtube_music',
    displayName: 'YouTube Music',
    kind: 'music_streaming',
    baseUrl: 'https://music.youtube.com',
    isActive: true,
    metadata: { iconColor: '#FF0000', priority: 3 },
  },
  {
    id: 'amazon_music',
    displayName: 'Amazon Music',
    kind: 'music_streaming',
    baseUrl: 'https://music.amazon.com',
    isActive: true,
    metadata: { iconColor: '#FF9900', priority: 4 },
  },
  {
    id: 'deezer',
    displayName: 'Deezer',
    kind: 'music_streaming',
    baseUrl: 'https://www.deezer.com',
    isActive: true,
    metadata: { iconColor: '#FEAA2D', priority: 5 },
  },
  {
    id: 'tidal',
    displayName: 'Tidal',
    kind: 'music_streaming',
    baseUrl: 'https://listen.tidal.com',
    isActive: true,
    metadata: { iconColor: '#000000', priority: 6 },
  },
  {
    id: 'soundcloud',
    displayName: 'SoundCloud',
    kind: 'social',
    baseUrl: 'https://soundcloud.com',
    isActive: true,
    metadata: { iconColor: '#FF5500', priority: 7 },
  },
  {
    id: 'bandcamp',
    displayName: 'Bandcamp',
    kind: 'retail',
    baseUrl: 'https://bandcamp.com',
    isActive: true,
    metadata: { iconColor: '#629AA9', priority: 8 },
  },
  {
    id: 'audiomack',
    displayName: 'Audiomack',
    kind: 'music_streaming',
    baseUrl: 'https://audiomack.com',
    isActive: true,
    metadata: { iconColor: '#FFA200', priority: 9 },
  },
  {
    id: 'pandora',
    displayName: 'Pandora',
    kind: 'music_streaming',
    baseUrl: 'https://www.pandora.com',
    isActive: false,
    metadata: { iconColor: '#224099', priority: 10 },
  },
  {
    id: 'boomplay',
    displayName: 'Boomplay',
    kind: 'music_streaming',
    baseUrl: 'https://www.boomplay.com',
    isActive: false,
    metadata: { iconColor: '#FF0033', priority: 11 },
  },
];

// =============================================================================
// SCRAPER CONFIGS SEED DATA
// =============================================================================

const SCRAPER_CONFIGS_SEED = [
  {
    network: 'spotify',
    strategy: 'api' as const,
    maxConcurrency: 5,
    maxJobsPerMinute: 60,
    enabled: true,
  },
  {
    network: 'apple_music',
    strategy: 'api' as const,
    maxConcurrency: 3,
    maxJobsPerMinute: 30,
    enabled: true,
  },
  {
    network: 'youtube',
    strategy: 'api' as const,
    maxConcurrency: 5,
    maxJobsPerMinute: 100,
    enabled: true,
  },
  {
    network: 'instagram',
    strategy: 'browser' as const,
    maxConcurrency: 2,
    maxJobsPerMinute: 10,
    enabled: true,
  },
  {
    network: 'twitter',
    strategy: 'api' as const,
    maxConcurrency: 3,
    maxJobsPerMinute: 30,
    enabled: true,
  },
  {
    network: 'tiktok',
    strategy: 'browser' as const,
    maxConcurrency: 2,
    maxJobsPerMinute: 10,
    enabled: true,
  },
  {
    network: 'soundcloud',
    strategy: 'http' as const,
    maxConcurrency: 3,
    maxJobsPerMinute: 20,
    enabled: true,
  },
  {
    network: 'bandcamp',
    strategy: 'http' as const,
    maxConcurrency: 2,
    maxJobsPerMinute: 15,
    enabled: false,
  },
];

// =============================================================================
// SEEDING FUNCTIONS
// =============================================================================

async function seedProvidersDirectory() {
  if (
    typeof (globalThis as { EdgeRuntime?: string }).EdgeRuntime !== 'undefined'
  ) {
    throw new Error('Provider seeding is not supported in Edge runtime');
  }

  console.log('📚 Seeding providers directory...');
  await db
    .insert(providers)
    .values(PROVIDER_SEED)
    .onConflictDoUpdate({
      target: providers.id,
      set: {
        displayName: drizzleSql`excluded.display_name`,
        kind: drizzleSql`excluded.kind`,
        baseUrl: drizzleSql`excluded.base_url`,
        isActive: drizzleSql`excluded.is_active`,
        metadata: drizzleSql`excluded.metadata`,
        updatedAt: drizzleSql`now()`,
      },
    });

  const providerCount = await db.select().from(providers);
  console.log(`  ✅ Providers seeded: ${providerCount.length}`);
}

async function seedScraperConfigs() {
  console.log('🕷️  Seeding scraper configs...');

  for (const config of SCRAPER_CONFIGS_SEED) {
    await db.insert(scraperConfigs).values(config).onConflictDoNothing();
  }

  const configCount = await db.select().from(scraperConfigs);
  console.log(`  ✅ Scraper configs seeded: ${configCount.length}`);
}

async function ensureSeedFunction() {
  // Create or replace the RLS-safe seed function used by this script
  const fnSql = `
  CREATE OR REPLACE FUNCTION seed_create_full_profile(
    p_clerk_user_id text,
    p_email text,
    p_profile jsonb,
    p_social_links jsonb DEFAULT '[]'::jsonb
  ) RETURNS uuid AS $$
  DECLARE
    v_user_id uuid;
    v_profile_id uuid;
    v_username text;
    v_display_name text;
    v_bio text;
    v_avatar_url text;
    v_spotify_url text;
    v_apple_music_url text;
    v_youtube_url text;
    v_creator_type creator_type := 'artist';
    v_is_public boolean := true;
    v_is_verified boolean := false;
    v_is_featured boolean := false;
  BEGIN
    PERFORM set_config('app.clerk_user_id', p_clerk_user_id, true);

    v_username := NULLIF(TRIM(p_profile->>'username'), '');
    IF v_username IS NULL THEN
      RAISE EXCEPTION 'username is required in p_profile';
    END IF;

    v_display_name := NULLIF(TRIM(p_profile->>'displayName'), '');
    v_bio := NULLIF(p_profile->>'bio', '');
    v_avatar_url := NULLIF(TRIM(p_profile->>'avatarUrl'), '');
    v_spotify_url := NULLIF(TRIM(p_profile->>'spotifyUrl'), '');
    v_apple_music_url := NULLIF(TRIM(p_profile->>'appleMusicUrl'), '');
    v_youtube_url := NULLIF(TRIM(p_profile->>'youtubeUrl'), '');
    v_creator_type := COALESCE((p_profile->>'creatorType')::creator_type, 'artist');
    v_is_public := COALESCE((p_profile->>'isPublic')::boolean, true);
    v_is_verified := COALESCE((p_profile->>'isVerified')::boolean, false);
    v_is_featured := COALESCE((p_profile->>'isFeatured')::boolean, false);

    INSERT INTO users (clerk_id, email)
    VALUES (p_clerk_user_id, p_email)
    ON CONFLICT (clerk_id)
    DO UPDATE SET email = EXCLUDED.email, updated_at = now()
    RETURNING id INTO v_user_id;

    SELECT id INTO v_profile_id FROM creator_profiles WHERE user_id = v_user_id LIMIT 1;

    IF v_profile_id IS NULL THEN
      INSERT INTO creator_profiles (
        user_id,
        creator_type,
        username,
        username_normalized,
        display_name,
        bio,
        avatar_url,
        spotify_url,
        apple_music_url,
        youtube_url,
        is_public,
        is_verified,
        is_featured,
        onboarding_completed_at
      ) VALUES (
        v_user_id,
        v_creator_type,
        v_username,
        lower(v_username),
        COALESCE(v_display_name, v_username),
        v_bio,
        v_avatar_url,
        v_spotify_url,
        v_apple_music_url,
        v_youtube_url,
        v_is_public,
        v_is_verified,
        v_is_featured,
        now()
      ) RETURNING id INTO v_profile_id;
    ELSE
      UPDATE creator_profiles SET
        creator_type = v_creator_type,
        username = v_username,
        username_normalized = lower(v_username),
        display_name = COALESCE(v_display_name, v_username),
        bio = v_bio,
        avatar_url = v_avatar_url,
        spotify_url = v_spotify_url,
        apple_music_url = v_apple_music_url,
        youtube_url = v_youtube_url,
        is_public = v_is_public,
        is_verified = v_is_verified,
        is_featured = v_is_featured,
        updated_at = now()
      WHERE id = v_profile_id;
    END IF;

    DELETE FROM social_links WHERE creator_profile_id = v_profile_id;

    INSERT INTO social_links (
      creator_profile_id,
      platform,
      platform_type,
      url,
      display_text,
      sort_order
    )
    SELECT
      v_profile_id,
      link_elem->>'platform',
      link_elem->>'platformType',
      link_elem->>'url',
      NULLIF(link_elem->>'displayText', ''),
      COALESCE((link_elem->>'sortOrder')::int, 0)
    FROM jsonb_array_elements(p_social_links) AS link_elem;

    RETURN v_profile_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE;
    WHEN others THEN
      RAISE;
  END;
  $$ LANGUAGE plpgsql SECURITY INVOKER;
  `;

  await db.execute(drizzleSql.raw(fnSql));
}

async function seedDiscography(
  profileId: string,
  discography: DiscographySeed[],
  username: string
) {
  for (const release of discography) {
    // Check if release already exists
    const existingRelease = await db
      .select()
      .from(discogReleases)
      .where(
        drizzleSql`creator_profile_id = ${profileId} AND slug = ${release.slug}`
      )
      .limit(1);

    let releaseId: string;

    if (existingRelease.length > 0) {
      releaseId = existingRelease[0].id;
      // Update existing release
      await db
        .update(discogReleases)
        .set({
          title: release.title,
          releaseType: release.releaseType,
          releaseDate: release.releaseDate,
          label: release.label,
          upc: release.upc,
          isExplicit: release.isExplicit ?? false,
          artworkUrl: release.artworkUrl,
          totalTracks: release.tracks.length,
          updatedAt: new Date(),
        })
        .where(drizzleSql`id = ${releaseId}`);
    } else {
      // Insert new release
      const [newRelease] = await db
        .insert(discogReleases)
        .values({
          creatorProfileId: profileId,
          title: release.title,
          slug: release.slug,
          releaseType: release.releaseType,
          releaseDate: release.releaseDate,
          label: release.label,
          upc: release.upc,
          isExplicit: release.isExplicit ?? false,
          artworkUrl: release.artworkUrl,
          totalTracks: release.tracks.length,
          sourceType: 'admin',
        })
        .returning();
      releaseId = newRelease.id;
    }

    // Seed tracks for this release
    for (const track of release.tracks) {
      const existingTrack = await db
        .select()
        .from(discogTracks)
        .where(drizzleSql`release_id = ${releaseId} AND slug = ${track.slug}`)
        .limit(1);

      let trackId: string;

      if (existingTrack.length > 0) {
        trackId = existingTrack[0].id;
        await db
          .update(discogTracks)
          .set({
            title: track.title,
            durationMs: track.durationMs,
            trackNumber: track.trackNumber,
            discNumber: track.discNumber ?? 1,
            isExplicit: track.isExplicit ?? false,
            isrc: track.isrc,
            previewUrl: track.previewUrl,
            updatedAt: new Date(),
          })
          .where(drizzleSql`id = ${trackId}`);
      } else {
        const [newTrack] = await db
          .insert(discogTracks)
          .values({
            releaseId,
            creatorProfileId: profileId,
            title: track.title,
            slug: track.slug,
            durationMs: track.durationMs,
            trackNumber: track.trackNumber,
            discNumber: track.discNumber ?? 1,
            isExplicit: track.isExplicit ?? false,
            isrc: track.isrc,
            previewUrl: track.previewUrl,
            sourceType: 'admin',
          })
          .returning();
        trackId = newTrack.id;
      }

      // Seed provider links for this track
      await seedProviderLinksForTrack(trackId, track.slug, username);
    }

    // Seed provider links for the release
    await seedProviderLinksForRelease(releaseId, release.slug, username);

    // Seed smart link targets
    await seedSmartLinkTargets(profileId, releaseId, release.slug, username);
  }
}

async function seedProviderLinksForRelease(
  releaseId: string,
  slug: string,
  username: string
) {
  const activeProviders = [
    'spotify',
    'apple_music',
    'youtube_music',
    'amazon_music',
    'deezer',
  ];

  for (const providerId of activeProviders) {
    const url = `https://${providerId.replace('_', '.')}.com/album/${username}-${slug}`;

    await db
      .insert(providerLinks)
      .values({
        providerId,
        ownerType: 'release',
        releaseId,
        externalId: `${providerId}-${slug}`,
        url,
        country: 'US',
        isPrimary: providerId === 'spotify',
        sourceType: 'admin',
      })
      .onConflictDoNothing();
  }
}

async function seedProviderLinksForTrack(
  trackId: string,
  slug: string,
  username: string
) {
  const activeProviders = ['spotify', 'apple_music', 'youtube_music'];

  for (const providerId of activeProviders) {
    const url = `https://${providerId.replace('_', '.')}.com/track/${username}-${slug}`;

    await db
      .insert(providerLinks)
      .values({
        providerId,
        ownerType: 'track',
        trackId,
        externalId: `${providerId}-track-${slug}`,
        url,
        country: 'US',
        isPrimary: providerId === 'spotify',
        sourceType: 'admin',
      })
      .onConflictDoNothing();
  }
}

async function seedSmartLinkTargets(
  profileId: string,
  releaseId: string,
  slug: string,
  username: string
) {
  const activeProviders = [
    'spotify',
    'apple_music',
    'youtube_music',
    'amazon_music',
    'deezer',
  ];

  for (let i = 0; i < activeProviders.length; i++) {
    const providerId = activeProviders[i];
    const url = `https://${providerId.replace('_', '.')}.com/album/${username}-${slug}`;

    await db
      .insert(smartLinkTargets)
      .values({
        creatorProfileId: profileId,
        smartLinkSlug: slug,
        providerId,
        releaseId,
        url,
        isFallback: i === activeProviders.length - 1,
        priority: i,
      })
      .onConflictDoNothing();
  }
}

async function seedContacts(profileId: string, contacts: ContactSeed[]) {
  // Delete existing contacts for this profile
  await db
    .delete(creatorContacts)
    .where(drizzleSql`creator_profile_id = ${profileId}`);

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    await db.insert(creatorContacts).values({
      creatorProfileId: profileId,
      role: contact.role,
      personName: contact.personName,
      companyName: contact.companyName,
      territories: contact.territories ?? [],
      email: contact.email,
      phone: contact.phone,
      preferredChannel: contact.preferredChannel,
      isActive: true,
      sortOrder: i,
    });
  }
}

async function seedSocialAccounts(profileId: string, username: string) {
  const platforms = [
    {
      platform: 'instagram',
      handle: username,
      status: 'confirmed' as const,
      isVerified: true,
    },
    {
      platform: 'twitter',
      handle: username,
      status: 'confirmed' as const,
      isVerified: false,
    },
    {
      platform: 'tiktok',
      handle: username,
      status: 'suspected' as const,
      isVerified: false,
    },
    {
      platform: 'youtube',
      handle: username,
      status: 'confirmed' as const,
      isVerified: true,
    },
    {
      platform: 'spotify',
      handle: username,
      status: 'confirmed' as const,
      isVerified: true,
    },
  ];

  for (const platform of platforms) {
    await db
      .insert(socialAccounts)
      .values({
        creatorProfileId: profileId,
        platform: platform.platform,
        handle: `@${platform.handle}`,
        url: `https://${platform.platform}.com/${platform.handle}`,
        status: platform.status,
        confidence: platform.status === 'confirmed' ? '0.95' : '0.60',
        isVerifiedFlag: platform.isVerified,
        paidFlag: false,
        sourcePlatform: 'spotify',
        sourceType: 'ingested',
      })
      .onConflictDoNothing();
  }
}

async function seedUserSettings(userId: string) {
  await db
    .insert(userSettings)
    .values({
      userId,
      themeMode: ['system', 'light', 'dark'][Math.floor(Math.random() * 3)] as
        | 'system'
        | 'light'
        | 'dark',
      sidebarCollapsed: Math.random() > 0.5,
    })
    .onConflictDoNothing();
}

async function seedAudienceMembers(profileId: string, displayName: string) {
  const countries = [
    'US',
    'GB',
    'CA',
    'AU',
    'DE',
    'FR',
    'JP',
    'BR',
    'MX',
    'ES',
  ];
  const cities = [
    'New York',
    'Los Angeles',
    'London',
    'Toronto',
    'Sydney',
    'Berlin',
    'Paris',
    'Tokyo',
    'Sao Paulo',
    'Mexico City',
  ];
  const deviceTypes = ['mobile', 'desktop', 'tablet', 'unknown'] as const;
  const memberTypes = [
    'anonymous',
    'email',
    'sms',
    'spotify',
    'customer',
  ] as const;
  const intentLevels = ['high', 'medium', 'low'] as const;

  // Generate 20-50 audience members per profile
  const memberCount = 20 + Math.floor(Math.random() * 30);

  for (let i = 0; i < memberCount; i++) {
    const countryIdx = Math.floor(Math.random() * countries.length);
    const memberType =
      memberTypes[Math.floor(Math.random() * memberTypes.length)];
    const firstSeen = randomDate(new Date('2024-01-01'), new Date());
    const lastSeen = randomDate(firstSeen, new Date());
    const visits = 1 + Math.floor(Math.random() * 50);
    const engagementScore = Math.floor(Math.random() * 100);

    await db
      .insert(audienceMembers)
      .values({
        creatorProfileId: profileId,
        type: memberType,
        displayName: memberType !== 'anonymous' ? `Fan ${i + 1}` : null,
        firstSeenAt: firstSeen,
        lastSeenAt: lastSeen,
        visits,
        engagementScore,
        intentLevel:
          intentLevels[Math.floor(Math.random() * intentLevels.length)],
        geoCity: cities[countryIdx],
        geoCountry: countries[countryIdx],
        deviceType: deviceTypes[Math.floor(Math.random() * deviceTypes.length)],
        referrerHistory: [
          { source: 'instagram', timestamp: firstSeen.toISOString() },
        ],
        latestActions: [
          { action: 'profile_view', timestamp: lastSeen.toISOString() },
        ],
        email:
          memberType === 'email' || memberType === 'customer'
            ? `fan${i}@example.com`
            : null,
        phone:
          memberType === 'sms' ? `+1555${String(i).padStart(7, '0')}` : null,
        spotifyConnected: memberType === 'spotify',
        purchaseCount:
          memberType === 'customer' ? 1 + Math.floor(Math.random() * 5) : 0,
        tags: engagementScore > 70 ? ['superfan'] : [],
        fingerprint: `fp_${profileId.slice(0, 8)}_${i}`,
      })
      .onConflictDoNothing();
  }
}

async function seedClickEvents(profileId: string, linkIds: string[]) {
  const countries = [
    'US',
    'GB',
    'CA',
    'AU',
    'DE',
    'FR',
    'JP',
    'BR',
    'MX',
    'ES',
  ];
  const cities = [
    'New York',
    'Los Angeles',
    'London',
    'Toronto',
    'Sydney',
    'Berlin',
    'Paris',
    'Tokyo',
    'Sao Paulo',
    'Mexico City',
  ];
  const devices = ['mobile', 'desktop', 'tablet'];
  const browsers = ['Chrome', 'Safari', 'Firefox', 'Edge'];
  const oses = ['iOS', 'Android', 'Windows', 'macOS', 'Linux'];
  const linkTypes = ['listen', 'social', 'tip', 'other'] as const;
  const referrers = [
    'https://instagram.com',
    'https://twitter.com',
    'https://google.com',
    'direct',
    null,
  ];

  // Generate 50-150 click events per profile
  const clickCount = 50 + Math.floor(Math.random() * 100);

  for (let i = 0; i < clickCount; i++) {
    const countryIdx = Math.floor(Math.random() * countries.length);
    const clickDate = randomDate(new Date('2024-01-01'), new Date());

    await db.insert(clickEvents).values({
      creatorProfileId: profileId,
      linkId:
        linkIds.length > 0
          ? linkIds[Math.floor(Math.random() * linkIds.length)]
          : null,
      linkType: linkTypes[Math.floor(Math.random() * linkTypes.length)],
      ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      userAgent: `Mozilla/5.0 (${oses[Math.floor(Math.random() * oses.length)]}) ${browsers[Math.floor(Math.random() * browsers.length)]}`,
      referrer: referrers[Math.floor(Math.random() * referrers.length)],
      country: countries[countryIdx],
      city: cities[countryIdx],
      deviceType: devices[Math.floor(Math.random() * devices.length)],
      os: oses[Math.floor(Math.random() * oses.length)],
      browser: browsers[Math.floor(Math.random() * browsers.length)],
      isBot: Math.random() < 0.02, // 2% bot traffic
      createdAt: clickDate,
    });
  }
}

async function seedTips(profileId: string) {
  const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const;
  const messages = [
    'Love your music!',
    'Keep up the great work!',
    'Your latest album is amazing!',
    'Thanks for the inspiration!',
    'Best concert ever!',
    null,
    null,
  ];

  // Generate 5-20 tips per featured profile
  const tipCount = 5 + Math.floor(Math.random() * 15);

  for (let i = 0; i < tipCount; i++) {
    const amount = [500, 1000, 2000, 2500, 5000, 10000][
      Math.floor(Math.random() * 6)
    ];
    const tipDate = randomDate(new Date('2024-01-01'), new Date());
    const isAnonymous = Math.random() < 0.3;

    await db.insert(tips).values({
      creatorProfileId: profileId,
      amountCents: amount,
      currency: currencies[Math.floor(Math.random() * currencies.length)],
      paymentIntentId: `pi_seed_${profileId.slice(0, 8)}_${i}_${Date.now()}`,
      contactEmail: isAnonymous ? null : `tipper${i}@example.com`,
      message: messages[Math.floor(Math.random() * messages.length)],
      isAnonymous,
      createdAt: tipDate,
    });
  }
}

async function seedNotificationSubscriptions(profileId: string) {
  const countries = ['US', 'GB', 'CA', 'AU', 'DE'];
  const cities = ['New York', 'Los Angeles', 'London', 'Toronto', 'Sydney'];
  const sources = ['website', 'mobile_app', 'qr_code', 'instagram_bio'];

  // Generate 10-30 email subscribers per profile
  const emailSubCount = 10 + Math.floor(Math.random() * 20);
  for (let i = 0; i < emailSubCount; i++) {
    const countryIdx = Math.floor(Math.random() * countries.length);
    await db
      .insert(notificationSubscriptions)
      .values({
        creatorProfileId: profileId,
        channel: 'email',
        email: `subscriber${i}_${profileId.slice(0, 8)}@example.com`,
        countryCode: countries[countryIdx],
        city: cities[countryIdx],
        ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        source: sources[Math.floor(Math.random() * sources.length)],
      })
      .onConflictDoNothing();
  }

  // Generate 5-15 SMS subscribers per profile
  const smsSubCount = 5 + Math.floor(Math.random() * 10);
  for (let i = 0; i < smsSubCount; i++) {
    const countryIdx = Math.floor(Math.random() * countries.length);
    await db
      .insert(notificationSubscriptions)
      .values({
        creatorProfileId: profileId,
        channel: 'sms',
        phone: `+1555${String(i).padStart(7, '0')}${profileId.slice(0, 4)}`,
        countryCode: countries[countryIdx],
        city: cities[countryIdx],
        ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        source: sources[Math.floor(Math.random() * sources.length)],
      })
      .onConflictDoNothing();
  }
}

async function seedDatabase() {
  console.log('🌱 Starting comprehensive database seeding...\n');

  try {
    // Step 1: Seed providers
    console.log('🧭 Seeding provider directory...');
    await seedProvidersDirectory();

    // Step 2: Seed scraper configs
    await seedScraperConfigs();

    // Step 3: Ensure the seed function exists
    console.log('🛠️  Ensuring seed function exists...');
    await ensureSeedFunction();

    // Step 4: Seed artist profiles
    console.log('👤 Seeding artist profiles via stored function...');
    const profileMap = new Map<string, { profileId: string; userId: string }>();

    for (const artist of ARTISTS) {
      try {
        const result = await db.execute(drizzleSql`
          SELECT seed_create_full_profile(
            ${artist.clerkId},
            ${artist.email},
            ${JSON.stringify(artist.profile)}::jsonb,
            ${JSON.stringify(artist.socialLinks)}::jsonb
          ) AS profile_id
        `);

        const profileId = (
          result as unknown as { rows: Array<{ profile_id: string }> }
        ).rows[0]?.profile_id;

        // Get user ID for this profile
        const userResult = await db
          .select({ id: users.id })
          .from(users)
          .where(drizzleSql`clerk_id = ${artist.clerkId}`)
          .limit(1);

        if (profileId && userResult.length > 0) {
          profileMap.set(artist.profile.username, {
            profileId,
            userId: userResult[0].id,
          });
        }

        console.log(
          `  ✅ Upserted: ${artist.profile.displayName} (@${artist.profile.username})`
        );
      } catch (e) {
        console.error(
          `  ❌ Failed for ${artist.profile.displayName} (@${artist.profile.username}):`,
          (e as Error).message
        );
      }
    }

    // Step 5: Seed additional data for each profile
    console.log('\n📀 Seeding discography, contacts, and analytics...');

    for (const artist of ARTISTS) {
      const profileInfo = profileMap.get(artist.profile.username);
      if (!profileInfo) continue;

      const { profileId, userId } = profileInfo;

      // Seed user settings
      await seedUserSettings(userId);

      // Seed discography if present
      if (artist.discography && artist.discography.length > 0) {
        console.log(
          `  📀 Seeding discography for ${artist.profile.displayName}...`
        );
        await seedDiscography(
          profileId,
          artist.discography,
          artist.profile.username
        );
      }

      // Seed contacts if present
      if (artist.contacts && artist.contacts.length > 0) {
        console.log(
          `  📇 Seeding contacts for ${artist.profile.displayName}...`
        );
        await seedContacts(profileId, artist.contacts);
      }

      // Seed social accounts
      await seedSocialAccounts(profileId, artist.profile.username);

      // Get social links for click events
      const links = await db
        .select({ id: socialLinks.id })
        .from(socialLinks)
        .where(drizzleSql`creator_profile_id = ${profileId}`);
      const linkIds = links.map(l => l.id);

      // Seed analytics data for featured/verified profiles
      if (artist.profile.isFeatured || artist.profile.isVerified) {
        console.log(
          `  📊 Seeding analytics for ${artist.profile.displayName}...`
        );
        await seedAudienceMembers(profileId, artist.profile.displayName);
        await seedClickEvents(profileId, linkIds);
        await seedTips(profileId);
        await seedNotificationSubscriptions(profileId);
      }
    }

    console.log('\n🎉 Database seeding completed successfully!');

    // Verification
    console.log('\n🔍 Verification:');
    const providerCount = await db.select().from(providers);
    const userCount = await db.select().from(users);
    const profileCount = await db.select().from(creatorProfiles);
    const linkCount = await db.select().from(socialLinks);
    const releaseCount = await db.select().from(discogReleases);
    const trackCount = await db.select().from(discogTracks);
    const providerLinkCount = await db.select().from(providerLinks);
    const smartLinkCount = await db.select().from(smartLinkTargets);
    const contactCount = await db.select().from(creatorContacts);
    const socialAccountCount = await db.select().from(socialAccounts);
    const audienceCount = await db.select().from(audienceMembers);
    const clickCount = await db.select().from(clickEvents);
    const tipCount = await db.select().from(tips);
    const notificationCount = await db.select().from(notificationSubscriptions);
    const settingsCount = await db.select().from(userSettings);
    const scraperCount = await db.select().from(scraperConfigs);

    console.log(`  • Providers: ${providerCount.length}`);
    console.log(`  • Users: ${userCount.length}`);
    console.log(`  • Creator Profiles: ${profileCount.length}`);
    console.log(`  • Social Links: ${linkCount.length}`);
    console.log(`  • Releases: ${releaseCount.length}`);
    console.log(`  • Tracks: ${trackCount.length}`);
    console.log(`  • Provider Links: ${providerLinkCount.length}`);
    console.log(`  • Smart Link Targets: ${smartLinkCount.length}`);
    console.log(`  • Contacts: ${contactCount.length}`);
    console.log(`  • Social Accounts: ${socialAccountCount.length}`);
    console.log(`  • Audience Members: ${audienceCount.length}`);
    console.log(`  • Click Events: ${clickCount.length}`);
    console.log(`  • Tips: ${tipCount.length}`);
    console.log(`  • Notification Subscriptions: ${notificationCount.length}`);
    console.log(`  • User Settings: ${settingsCount.length}`);
    console.log(`  • Scraper Configs: ${scraperCount.length}`);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

async function main() {
  const branch =
    process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || 'local';
  console.log(`🔀 Detected branch: ${branch}`);

  if (branch === 'production') {
    console.log('⚠️  Skipping: will not seed production database');
    return;
  }

  try {
    await initDb();
    await seedDatabase();
  } finally {
    await closeDb();
    console.log('🔌 Database connection closed');
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export { seedDatabase };
