#!/usr/bin/env tsx

/**
 * Seed Admin User Script
 *
 * Creates or updates the admin user account with:
 * - Admin privileges
 * - Pro features
 * - Creator profile with username /tim
 *
 * Usage:
 *   1. First sign up via Clerk with tim@jov.ie
 *   2. Run: DATABASE_URL="..." pnpm exec tsx scripts/seed-admin-user.ts
 *
 * Or with doppler:
 *   pnpm exec doppler run -- tsx scripts/seed-admin-user.ts
 */

import { neon } from '@neondatabase/serverless';
import { config as dotenvConfig } from 'dotenv';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/lib/db/schema';
import {
  creatorProfiles,
  userSettings,
  users,
  waitlistEntries,
} from '@/lib/db/schema';

dotenvConfig({ path: '.env.local', override: true });
dotenvConfig();

const ADMIN_CONFIG = {
  email: 'tim@jov.ie',
  username: 'tim',
  displayName: 'Tim White',
  bio: 'Founder of Jovie',
  creatorType: 'creator' as const,
  isAdmin: true,
  isPro: true,
  isVerified: true,
  isFeatured: false,
  isPublic: true,
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not configured');
    process.exit(1);
  }

  console.log('🔧 Seeding admin user...\n');

  const sqlClient = neon(databaseUrl);
  const db = drizzle(sqlClient, { schema });

  // Step 1: Find or create user by email
  let existingUsers = await db
    .select()
    .from(users)
    .where(eq(users.email, ADMIN_CONFIG.email))
    .limit(1);

  let userId: string;
  let clerkId: string | null = null;

  if (existingUsers.length > 0) {
    userId = existingUsers[0].id;
    clerkId = existingUsers[0].clerkId;
    console.log(`✓ Found existing user: ${userId}`);
    console.log(`  Clerk ID: ${clerkId}`);

    // Update admin/pro flags
    await db
      .update(users)
      .set({
        isAdmin: ADMIN_CONFIG.isAdmin,
        isPro: ADMIN_CONFIG.isPro,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    console.log(
      `✓ Updated user flags: isAdmin=${ADMIN_CONFIG.isAdmin}, isPro=${ADMIN_CONFIG.isPro}`
    );
  } else {
    // User doesn't exist yet - check for CLERK_USER_ID env var or prompt
    const clerkUserIdFromEnv = process.env.CLERK_USER_ID;

    if (!clerkUserIdFromEnv) {
      console.log('⚠️  No user found with email:', ADMIN_CONFIG.email);
      console.log('');
      console.log(
        'The user record needs to be created. Please provide your Clerk User ID.'
      );
      console.log('You can find it in the Clerk Dashboard under Users.');
      console.log('');
      console.log('Then run:');
      console.log(
        `  CLERK_USER_ID="user_xxx" DATABASE_URL="..." pnpm exec tsx scripts/seed-admin-user.ts`
      );
      process.exit(1);
    }

    // Create the user with the provided Clerk ID
    console.log(`Creating user with Clerk ID: ${clerkUserIdFromEnv}`);
    const [newUser] = await db
      .insert(users)
      .values({
        clerkId: clerkUserIdFromEnv,
        email: ADMIN_CONFIG.email,
        name: ADMIN_CONFIG.displayName,
        isAdmin: ADMIN_CONFIG.isAdmin,
        isPro: ADMIN_CONFIG.isPro,
      })
      .returning();

    userId = newUser.id;
    clerkId = clerkUserIdFromEnv;
    console.log(`✓ Created user: ${userId}`);
    console.log(`  Clerk ID: ${clerkId}`);
  }

  // Step 2: Find or create creator profile
  let existingProfiles = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);

  let profileId: string;

  if (existingProfiles.length > 0) {
    profileId = existingProfiles[0].id;
    console.log(`✓ Found existing profile: ${profileId}`);

    // Update profile
    await db
      .update(creatorProfiles)
      .set({
        username: ADMIN_CONFIG.username,
        usernameNormalized: ADMIN_CONFIG.username.toLowerCase(),
        displayName: ADMIN_CONFIG.displayName,
        bio: ADMIN_CONFIG.bio,
        creatorType: ADMIN_CONFIG.creatorType,
        isVerified: ADMIN_CONFIG.isVerified,
        isFeatured: ADMIN_CONFIG.isFeatured,
        isPublic: ADMIN_CONFIG.isPublic,
        onboardingCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profileId));
    console.log(`✓ Updated profile: /${ADMIN_CONFIG.username}`);
  } else {
    // Check if username is taken
    const usernameCheck = await db
      .select()
      .from(creatorProfiles)
      .where(
        eq(
          creatorProfiles.usernameNormalized,
          ADMIN_CONFIG.username.toLowerCase()
        )
      )
      .limit(1);

    if (usernameCheck.length > 0) {
      console.error(
        `❌ Username /${ADMIN_CONFIG.username} is already taken by another profile`
      );
      process.exit(1);
    }

    // Create new profile
    const [newProfile] = await db
      .insert(creatorProfiles)
      .values({
        userId,
        username: ADMIN_CONFIG.username,
        usernameNormalized: ADMIN_CONFIG.username.toLowerCase(),
        displayName: ADMIN_CONFIG.displayName,
        bio: ADMIN_CONFIG.bio,
        creatorType: ADMIN_CONFIG.creatorType,
        isVerified: ADMIN_CONFIG.isVerified,
        isFeatured: ADMIN_CONFIG.isFeatured,
        isPublic: ADMIN_CONFIG.isPublic,
        onboardingCompletedAt: new Date(),
      })
      .returning();

    profileId = newProfile.id;
    console.log(`✓ Created profile: /${ADMIN_CONFIG.username} (${profileId})`);
  }

  // Step 3: Ensure user settings exist
  const existingSettings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (existingSettings.length === 0) {
    await db.insert(userSettings).values({
      userId,
      themeMode: 'system',
      sidebarCollapsed: false,
    });
    console.log('✓ Created user settings');
  }

  // Step 4: Create or update waitlist entry with 'claimed' status to bypass waitlist
  const existingWaitlist = await db
    .select()
    .from(waitlistEntries)
    .where(
      drizzleSql`lower(${waitlistEntries.email}) = ${ADMIN_CONFIG.email.toLowerCase()}`
    )
    .limit(1);

  if (existingWaitlist.length > 0) {
    await db
      .update(waitlistEntries)
      .set({
        status: 'claimed',
        updatedAt: new Date(),
      })
      .where(eq(waitlistEntries.id, existingWaitlist[0].id));
    console.log('✓ Updated waitlist entry to claimed status');
  } else {
    await db.insert(waitlistEntries).values({
      fullName: ADMIN_CONFIG.displayName,
      email: ADMIN_CONFIG.email,
      primarySocialUrl: `https://jov.ie/${ADMIN_CONFIG.username}`,
      primarySocialPlatform: 'jovie',
      primarySocialUrlNormalized: `https://jov.ie/${ADMIN_CONFIG.username}`,
      status: 'claimed',
    });
    console.log('✓ Created waitlist entry with claimed status');
  }

  console.log('\n✅ Admin user setup complete!\n');
  console.log('Summary:');
  console.log(`  Email:    ${ADMIN_CONFIG.email}`);
  console.log(`  Username: /${ADMIN_CONFIG.username}`);
  console.log(`  Admin:    ${ADMIN_CONFIG.isAdmin}`);
  console.log(`  Pro:      ${ADMIN_CONFIG.isPro}`);
  console.log(`  Verified: ${ADMIN_CONFIG.isVerified}`);
  console.log(`  User ID:  ${userId}`);
  console.log(`  Profile:  ${profileId}`);
  if (clerkId) {
    console.log(`  Clerk ID: ${clerkId}`);
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
