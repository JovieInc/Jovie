#!/usr/bin/env tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Set Tim White as Featured
 * Makes Tim White featured so he appears in the homepage carousel
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
  console.log('⭐ Setting Tim White as featured...\n');

  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql, { schema });

  try {
    // Set Tim White as featured
    const result = await db
      .update(schema.creatorProfiles)
      .set({
        isFeatured: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.creatorProfiles.username, 'timwhite'))
      .returning({
        id: schema.creatorProfiles.id,
        displayName: schema.creatorProfiles.displayName,
        username: schema.creatorProfiles.username,
        isFeatured: schema.creatorProfiles.isFeatured,
        isVerified: schema.creatorProfiles.isVerified,
      });

    if (result.length === 0) {
      console.log('❌ Tim White profile not found');
      return;
    }

    const profile = result[0];
    console.log('✅ Tim White is now featured!');
    console.log(`   Display Name: ${profile.displayName}`);
    console.log(`   Username: @${profile.username}`);
    console.log(`   Featured: ${profile.isFeatured ? 'Yes' : 'No'}`);
    console.log(`   Verified: ${profile.isVerified ? 'Yes' : 'No'}`);
    console.log(
      '\n🎯 Tim White will now appear in the homepage featured creators carousel!'
    );
  } catch (error) {
    console.error('❌ Error setting Tim White as featured:', error);
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
