#!/usr/bin/env tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Fix Tim White Profile
 * Merges duplicate Tim White profiles and adds correct Spotify ID
 */

import { neon } from '@neondatabase/serverless';
import { config as dotenvConfig } from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/lib/db/schema';

// Load environment variables
dotenvConfig({ path: '.env.local', override: true });
dotenvConfig();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
  process.exit(1);
}

async function main() {
  console.log('🔧 Fixing Tim White profile...\n');

  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql, { schema });

  try {
    // First, let's see all Tim White profiles
    const timProfiles = await db
      .select()
      .from(schema.creatorProfiles)
      .where(eq(schema.creatorProfiles.username, 'timwhite'));

    console.log(`📊 Found ${timProfiles.length} Tim White profiles:`);

    for (const profile of timProfiles) {
      console.log(`   • ID: ${profile.id}`);
      console.log(`     Display Name: "${profile.displayName || 'empty'}"`);
      console.log(`     Username: @${profile.username}`);
      console.log(
        `     Avatar: ${profile.avatarUrl ? '✅ Has avatar' : '❌ No avatar'}`
      );
      console.log(`     Spotify ID: ${profile.spotifyId || 'None'}`);
      console.log(`     User ID: ${profile.userId || 'None'}`);
      console.log('');
    }

    if (timProfiles.length === 0) {
      console.log('❌ No Tim White profiles found');
      return;
    }

    if (timProfiles.length === 1) {
      console.log(
        '✅ Only one Tim White profile found, just updating with Spotify data'
      );
      const profile = timProfiles[0];

      await db
        .update(schema.creatorProfiles)
        .set({
          displayName: 'Tim White',
          spotifyId: '4Uwpa6zW3zzCSQvooQNksm',
          spotifyUrl: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
          updatedAt: new Date(),
        })
        .where(eq(schema.creatorProfiles.id, profile.id));

      console.log('✅ Updated Tim White profile with Spotify data');
      return;
    }

    // If we have multiple profiles, merge them
    console.log('🔄 Multiple Tim White profiles found, merging...');

    // Find the profile with a display name (keep this one)
    const profileToKeep =
      timProfiles.find(p => p.displayName?.trim()) || timProfiles[0];
    const profilesToDelete = timProfiles.filter(p => p.id !== profileToKeep.id);

    console.log(
      `✅ Keeping profile: ${profileToKeep.id} (${profileToKeep.displayName || 'No display name'})`
    );
    console.log(`🗑️  Will delete ${profilesToDelete.length} duplicate(s)`);

    // Update the profile we're keeping with all the good data
    await db
      .update(schema.creatorProfiles)
      .set({
        displayName: 'Tim White',
        spotifyId: '4Uwpa6zW3zzCSQvooQNksm',
        spotifyUrl: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
        isVerified: true, // Tim is verified
        updatedAt: new Date(),
      })
      .where(eq(schema.creatorProfiles.id, profileToKeep.id));

    console.log('✅ Updated main Tim White profile');

    // Delete the duplicate profiles
    for (const profile of profilesToDelete) {
      // First delete any social links associated with this profile
      await db
        .delete(schema.socialLinks)
        .where(eq(schema.socialLinks.creatorProfileId, profile.id));

      console.log(
        `🗑️  Deleted social links for duplicate profile ${profile.id}`
      );

      // Then delete the profile
      await db
        .delete(schema.creatorProfiles)
        .where(eq(schema.creatorProfiles.id, profile.id));

      console.log(`🗑️  Deleted duplicate profile ${profile.id}`);
    }

    console.log('\n🎉 Tim White profile merge completed!');

    // Verify the final result
    const finalProfiles = await db
      .select()
      .from(schema.creatorProfiles)
      .where(eq(schema.creatorProfiles.username, 'timwhite'));

    console.log('\n📊 Final result:');
    for (const profile of finalProfiles) {
      console.log(`   ✅ Tim White (@${profile.username})`);
      console.log(`      Display Name: ${profile.displayName}`);
      console.log(`      Spotify ID: ${profile.spotifyId}`);
      console.log(
        `      Avatar: ${profile.avatarUrl ? 'Has avatar' : 'No avatar'}`
      );
      console.log(`      Verified: ${profile.isVerified ? 'Yes' : 'No'}`);
    }
  } catch (error) {
    console.error('❌ Error fixing Tim White profile:', error);
    process.exit(1);
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
