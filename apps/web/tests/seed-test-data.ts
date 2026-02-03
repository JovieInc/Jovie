/**
 * E2E Test Database Seeding
 *
 * Seeds the test database with minimal required data for smoke tests.
 * Run this before E2E tests to ensure test profiles exist.
 *
 * ESLint exceptions:
 * - no-restricted-syntax: Seed scripts need direct drizzle-orm sql access
 * - no-restricted-imports: Seed scripts import full schema for flexibility
 * - no-manual-db-pooling: Seed scripts run outside app context, need manual pools
 */

/* eslint-disable no-restricted-syntax, no-restricted-imports, @jovie/no-manual-db-pooling */
import { neonConfig, Pool } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from '@/lib/db/schema';

// Configure WebSocket for transaction support in tests
neonConfig.webSocketConstructor = ws;

const { users, creatorProfiles, socialLinks } = schema;

interface TestProfile {
  username: string;
  displayName: string;
  bio: string;
  spotifyUrl?: string;
  avatarUrl?: string;
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
];

export async function seedTestData() {
  console.log('🌱 Seeding test data for E2E smoke tests...');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('⚠ DATABASE_URL not set, skipping seed');
    return { success: false, reason: 'no_database_url' };
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  try {
    // Create E2E test user (for authenticated dashboard tests)
    // These values come from the setup script: scripts/setup-e2e-users.ts
    const E2E_CLERK_USER_ID = process.env.E2E_CLERK_USER_ID;
    const E2E_EMAIL = process.env.E2E_CLERK_USER_USERNAME || 'e2e@jov.ie';
    const E2E_USERNAME = 'e2e-test-user';

    if (!E2E_CLERK_USER_ID) {
      console.log('  ⚠ E2E_CLERK_USER_ID not set, skipping E2E user creation');
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
        // Create the user record
        const [createdUser] = await db
          .insert(users)
          .values({
            clerkId: E2E_CLERK_USER_ID,
            email: E2E_EMAIL,
            name: 'E2E Test User',
            userStatus: 'active', // Active user with completed onboarding
          })
          .returning({ id: users.id });

        console.log(`    ✓ Created E2E user (ID: ${createdUser.id})`);

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
      } else {
        console.log('    ✓ E2E test user already exists (skipping)');
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

      // Create the creator profile (no user association needed for public profiles)
      // NOTE: Uses explicit column list to be resilient to schema changes (e.g., waitlist_entry_id migration)
      // This avoids Drizzle trying to insert columns that may not exist in all environments
      const result = await db.execute<{ id: string }>(
        sql`INSERT INTO creator_profiles (
          username, username_normalized, display_name, bio,
          spotify_url, avatar_url, creator_type,
          is_public, is_verified, is_claimed, ingestion_status
        ) VALUES (
          ${profile.username},
          ${profile.username.toLowerCase()},
          ${profile.displayName},
          ${profile.bio},
          ${profile.spotifyUrl || null},
          ${profile.avatarUrl || null},
          ${'artist'},
          ${true},
          ${false},
          ${false},
          ${'idle'}
        ) RETURNING id`
      );
      const createdProfile = result.rows[0];

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

      // Invalidate Redis cache for this profile to ensure fresh data
      // Only attempt if Redis credentials are available
      if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        try {
          const redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
          });
          const cacheKey = `profile:data:${profile.username.toLowerCase()}`;
          await redis.del(cacheKey);
          console.log(`    ✓ Invalidated Redis cache for ${profile.username}`);
        } catch (error) {
          console.warn(
            `    ⚠ Failed to invalidate Redis cache for ${profile.username}:`,
            error
          );
        }
      }
    }

    await pool.end();
    console.log('✅ Test data seeding complete');
    return { success: true };
  } catch (error) {
    await pool.end();
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
