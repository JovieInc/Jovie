#!/usr/bin/env tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Check Seeded Artists Script
 * Queries the database to see current seeded artists and their image status
 */

import { neon } from '@neondatabase/serverless';
import { config as dotenvConfig } from 'dotenv';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/lib/db/schema';

console.error('❌ Seed profiles have been removed; this script is disabled.');
process.exit(1);

// Load environment variables
dotenvConfig({ path: '.env.local', override: true });
dotenvConfig();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
  process.exit(1);
}

async function main() {
  console.log('🔍 Checking seeded artists and their image status...\n');

  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql, { schema });

  try {
    // Get all creator profiles
    const profiles = await db
      .select({
        id: schema.creatorProfiles.id,
        username: schema.creatorProfiles.username,
        displayName: schema.creatorProfiles.displayName,
        avatarUrl: schema.creatorProfiles.avatarUrl,
        spotifyId: schema.creatorProfiles.spotifyId,
        spotifyUrl: schema.creatorProfiles.spotifyUrl,
        isPublic: schema.creatorProfiles.isPublic,
        isVerified: schema.creatorProfiles.isVerified,
        createdAt: schema.creatorProfiles.createdAt,
      })
      .from(schema.creatorProfiles)
      .orderBy(schema.creatorProfiles.createdAt);

    console.log(`📊 Found ${profiles.length} creator profiles:\n`);

    for (const profile of profiles) {
      const hasAvatar = !!profile.avatarUrl;
      const hasSpotifyId = !!profile.spotifyId;
      const avatarStatus = hasAvatar ? '✅ Has avatar' : '❌ No avatar';
      const spotifyStatus = hasSpotifyId
        ? '✅ Has Spotify ID'
        : '❌ No Spotify ID';

      console.log(`🎵 ${profile.displayName} (@${profile.username})`);
      console.log(`   ${avatarStatus}`);
      console.log(`   ${spotifyStatus}`);
      if (profile.avatarUrl) {
        console.log(`   📸 Avatar: ${profile.avatarUrl}`);
      }
      if (profile.spotifyId) {
        console.log(`   🎧 Spotify ID: ${profile.spotifyId}`);
      }
      console.log(`   👁️  Public: ${profile.isPublic ? 'Yes' : 'No'}`);
      console.log(`   ✓ Verified: ${profile.isVerified ? 'Yes' : 'No'}`);
      console.log('');
    }

    // Summary stats
    const totalProfiles = profiles.length;
    const withAvatars = profiles.filter(p => p.avatarUrl).length;
    const withSpotifyIds = profiles.filter(p => p.spotifyId).length;
    const needingImages = profiles.filter(p => !p.avatarUrl).length;

    console.log('📈 Summary:');
    console.log(`   Total profiles: ${totalProfiles}`);
    console.log(`   With avatars: ${withAvatars}`);
    console.log(`   With Spotify IDs: ${withSpotifyIds}`);
    console.log(`   Needing images: ${needingImages}`);

    if (needingImages > 0) {
      console.log('\n🎯 Artists needing images:');
      profiles
        .filter(p => !p.avatarUrl)
        .forEach(p => {
          console.log(`   • ${p.displayName} (@${p.username})`);
        });
    }
  } catch (error) {
    console.error('❌ Error checking artists:', error);
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
