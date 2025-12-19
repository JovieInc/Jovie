#!/usr/bin/env -S tsx

import { neon } from '@neondatabase/serverless';
/**
 * Drizzle Database Seed Script
 * Seeds the database with demo data using Drizzle ORM and Neon
 */

import { config as dotenvConfig } from 'dotenv';
import { sql as drizzleSql } from 'drizzle-orm';
import {
  type NeonHttpDatabase,
  drizzle as neonDrizzle,
} from 'drizzle-orm/neon-http';
import {
  type PostgresJsDatabase,
  drizzle as pgDrizzle,
} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/db/schema';
import {
  creatorProfiles,
  type NewProvider,
  providers,
  socialLinks,
  users,
} from '@/lib/db/schema';

// Load .env.local first to override defaults, then fallback to .env
dotenvConfig({ path: '.env.local', override: true });
dotenvConfig();

if (process.env.ALLOW_DB_SEED !== '1') {
  console.error('❌ db:seed is disabled. Seed profiles have been removed.');
  process.exit(1);
}

// URL patterns for special cases
const NEON_PLUS_PATTERN = /(postgres)(|ql)(\+neon)(.*)/;
const TCP_PLUS_PATTERN = /(postgres)(|ql)(\+tcp)(.*)/;

const DATABASE_URL: string = process.env.DATABASE_URL ?? '';
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
  process.exit(1);
}
type SeedDB =
  | NeonHttpDatabase<typeof schema>
  | PostgresJsDatabase<typeof schema>;
let db: SeedDB;
let closeDb: () => Promise<void> = async () => {};

function isTcpUrl(url: string): boolean {
  // Explicit +tcp suffix or an explicit port suggests TCP client usage
  if (TCP_PLUS_PATTERN.test(url)) return true;
  try {
    const u = new URL(url);
    return Boolean(u.port); // heuristically treat URLs with ports as TCP
  } catch {
    return false;
  }
}

function normalizeForNeon(url: string): string {
  // strip "+neon" suffix if present
  return url.replace(NEON_PLUS_PATTERN, 'postgres$2$4');
}

function normalizeForTcp(url: string): string {
  // Convert +tcp -> normal protocol; also strip +neon if present
  let u = url.replace(TCP_PLUS_PATTERN, 'postgres$2$4');
  u = u.replace(NEON_PLUS_PATTERN, 'postgres$2$4');
  return u;
}

function logConnInfo(url: string) {
  try {
    const u = new URL(url);
    const redacted = `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`;
    console.log(`🔌 DB target: ${redacted}`);
  } catch {}
}

async function initDb(): Promise<void> {
  // Prefer Neon HTTP unless URL explicitly demands TCP
  if (!isTcpUrl(DATABASE_URL)) {
    const neonUrl = normalizeForNeon(DATABASE_URL);
    logConnInfo(neonUrl);
    try {
      const sqlClient = neon(neonUrl);
      const neonDb = neonDrizzle(sqlClient, { schema });
      // quick ping
      await neonDb.execute(drizzleSql`SELECT 1`);
      db = neonDb;
      closeDb = async () => {
        /* neon-http doesn't require explicit close */
      };
      return;
    } catch (err) {
      console.warn(
        '⚠️  Neon HTTP init failed, falling back to TCP:',
        (err as Error).message
      );
      // fall through to TCP
    }
  }

  // Fallback to TCP
  const tcpUrl = normalizeForTcp(DATABASE_URL);
  logConnInfo(tcpUrl);
  const sqlClient = postgres(tcpUrl, { ssl: true, max: 1, onnotice: () => {} });
  const pgDb = pgDrizzle(sqlClient, { schema });
  // quick ping
  await pgDb.execute(drizzleSql`SELECT 1`);
  db = pgDb;
  closeDb = async () => {
    try {
      await sqlClient.end();
    } catch {}
  };
}

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
    creatorType?: 'artist';
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
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-/g, ''); // compact for socials (e.g., the1975)
}

function makeArtist(name: string): ArtistSeed {
  const username = slugify(name);
  const handle = username; // reuse for socials

  // Special handling for Tim White
  const isTimWhite = name === 'Tim White';

  return {
    clerkId: `seed_${username}`,
    email: `${username}@example.com`,
    profile: {
      username,
      displayName: name,
      bio: isTimWhite
        ? `Tim White - Verified artist and creator of Jovie.`
        : `Official ${name} demo profile for development and testing.`,
      creatorType: 'artist',
      isPublic: true,
      isVerified: isTimWhite,
      isFeatured: isTimWhite,
      spotifyUrl: isTimWhite
        ? `https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm`
        : `https://open.spotify.com/artist/demo-${username}`,
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
    ],
  };
}

const ARTISTS: ArtistSeed[] = [
  makeArtist('Tim White'),
  makeArtist('The 1975'),
  makeArtist('Coldplay'),
  makeArtist('Billie Eilish'),
  makeArtist('Dua Lipa'),
  makeArtist('John Mayer'),
  makeArtist('Lady Gaga'),
  makeArtist('Ed Sheeran'),
  makeArtist('Taylor Swift'),
  makeArtist('Måneskin'),
];

const PROVIDER_SEED: NewProvider[] = [
  {
    id: 'spotify',
    displayName: 'Spotify',
    kind: 'music_streaming',
    baseUrl: 'https://open.spotify.com',
    isActive: true,
  },
  {
    id: 'apple_music',
    displayName: 'Apple Music',
    kind: 'music_streaming',
    baseUrl: 'https://music.apple.com',
    isActive: true,
  },
  {
    id: 'youtube_music',
    displayName: 'YouTube Music',
    kind: 'music_streaming',
    baseUrl: 'https://music.youtube.com',
    isActive: true,
  },
  {
    id: 'amazon_music',
    displayName: 'Amazon Music',
    kind: 'music_streaming',
    baseUrl: 'https://music.amazon.com',
    isActive: true,
  },
  {
    id: 'deezer',
    displayName: 'Deezer',
    kind: 'music_streaming',
    baseUrl: 'https://www.deezer.com',
    isActive: true,
  },
  {
    id: 'tidal',
    displayName: 'Tidal',
    kind: 'music_streaming',
    baseUrl: 'https://listen.tidal.com',
    isActive: true,
  },
  {
    id: 'soundcloud',
    displayName: 'SoundCloud',
    kind: 'social',
    baseUrl: 'https://soundcloud.com',
    isActive: true,
  },
  {
    id: 'bandcamp',
    displayName: 'Bandcamp',
    kind: 'retail',
    baseUrl: 'https://bandcamp.com',
    isActive: true,
  },
  {
    id: 'audiomack',
    displayName: 'Audiomack',
    kind: 'music_streaming',
    baseUrl: 'https://audiomack.com',
    isActive: true,
  },
  {
    id: 'pandora',
    displayName: 'Pandora',
    kind: 'music_streaming',
    baseUrl: 'https://www.pandora.com',
    isActive: false,
  },
  {
    id: 'boomplay',
    displayName: 'Boomplay',
    kind: 'music_streaming',
    baseUrl: 'https://www.boomplay.com',
    isActive: false,
  },
];

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

async function seedDatabase() {
  console.log('🌱 Starting Drizzle database seeding...\n');

  try {
    console.log('🧭 Seeding provider directory...');
    await seedProvidersDirectory();

    // Ensure the seed function exists (no-op if already created)
    console.log('🛠️  Ensuring seed function exists...');
    await ensureSeedFunction();

    // Seed 10 artists with full profiles and links via stored function (RLS-safe)
    console.log('👤 Seeding artist profiles via stored function...');
    for (const artist of ARTISTS) {
      try {
        await db.execute(drizzleSql`
          SELECT seed_create_full_profile(
            ${artist.clerkId},
            ${artist.email},
            ${JSON.stringify(artist.profile)}::jsonb,
            ${JSON.stringify(artist.socialLinks)}::jsonb
          ) AS profile_id
        `);
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

    console.log('\n🎉 Database seeding completed successfully!');

    // Verify the data
    console.log('\n🔍 Verification:');
    const providerCount = await db.select().from(providers);
    const userCount = await db.select().from(users); // may be RLS-filtered
    const profileCount = await db.select().from(creatorProfiles); // is_public=true allows visibility
    const linkCount = await db.select().from(socialLinks); // visible through public profiles policy

    console.log(`  • Providers: ${providerCount.length}`);
    console.log(`  • Users: ${userCount.length}`);
    console.log(`  • Creator Profiles: ${profileCount.length}`);
    console.log(`  • Social Links: ${linkCount.length}`);
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
