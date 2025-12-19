#!/usr/bin/env tsx

/**
 * Set Featured Artists
 * Makes several artists featured so they appear in the homepage carousel
 */

import { config as dotenvConfig } from 'dotenv';
import { inArray } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { createNeonClient } from './utils/neon-client';

// Load environment variables
dotenvConfig({ path: '.env.local', override: true });
dotenvConfig();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
  process.exit(1);
}

// Artists to feature for the homepage carousel
const FEATURED_ARTISTS = [
  'timwhite',
  'the1975',
  'coldplay',
  'billieeilish',
  'dualipa',
  'johnmayer',
  'ladygaga',
  'edsheeran',
  'taylorswift',
  'maneskin',
];

async function main() {
  console.log('⭐ Setting featured artists...\n');

  const { db, pool } = createNeonClient(DATABASE_URL!, { schema });

  try {
    // Set selected artists as featured
    const result = await db
      .update(schema.creatorProfiles)
      .set({
        isFeatured: true,
        updatedAt: new Date(),
      })
      .where(inArray(schema.creatorProfiles.username, FEATURED_ARTISTS))
      .returning({
        id: schema.creatorProfiles.id,
        displayName: schema.creatorProfiles.displayName,
        username: schema.creatorProfiles.username,
        isFeatured: schema.creatorProfiles.isFeatured,
        avatarUrl: schema.creatorProfiles.avatarUrl,
      });

    console.log(`✅ Featured ${result.length} artists:\n`);

    for (const profile of result) {
      console.log(`🎵 ${profile.displayName} (@${profile.username})`);
      console.log(`   📸 Avatar: ${profile.avatarUrl}`);
      console.log('');
    }

    console.log(
      '🎯 These artists will now appear in the homepage featured creators carousel!'
    );
  } catch (error) {
    console.error('❌ Error setting featured artists:', error);
    process.exit(1);
  } finally {
    await pool.end();
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
