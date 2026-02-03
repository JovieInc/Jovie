#!/usr/bin/env tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Create Artist Placeholder Images
 * Creates simple, professional placeholder avatars for artists
 */

import { neon } from '@neondatabase/serverless';
import { config as dotenvConfig } from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as schema from '@/lib/db/schema';

// Load environment variables
dotenvConfig({ path: '.env.local', override: true });
dotenvConfig();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
  process.exit(1);
}

// Artist placeholder mappings for those that failed to download
const ARTIST_PLACEHOLDERS: Record<
  string,
  {
    filename: string;
    initials: string;
    color: string; // Background color
    displayName: string;
    spotifyId: string;
    spotifyUrl: string;
  }
> = {
  timwhite: {
    filename: 'tim-white.svg',
    initials: 'TW',
    color: '#6366f1', // Indigo
    displayName: 'Tim White',
    spotifyId: '4Uwpa6zW3zzCSQvooQNksm',
    spotifyUrl: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
  },
  the1975: {
    filename: 'the-1975.svg',
    initials: '19',
    color: '#ec4899', // Pink
    displayName: 'The 1975',
    spotifyId: '3mIj9lX2MWuHmhNCA7LQZC',
    spotifyUrl: 'https://open.spotify.com/artist/3mIj9lX2MWuHmhNCA7LQZC',
  },
  coldplay: {
    filename: 'coldplay.svg',
    initials: 'CP',
    color: '#10b981', // Emerald
    displayName: 'Coldplay',
    spotifyId: '4gzpq5DPGxSnKTe4SA8HAU',
    spotifyUrl: 'https://open.spotify.com/artist/4gzpq5DPGxSnKTe4SA8HAU',
  },
  johnmayer: {
    filename: 'john-mayer.svg',
    initials: 'JM',
    color: '#f59e0b', // Amber
    displayName: 'John Mayer',
    spotifyId: '0hEurMDQu99nJRq8pTxO14',
    spotifyUrl: 'https://open.spotify.com/artist/0hEurMDQu99nJRq8pTxO14',
  },
  ladygaga: {
    filename: 'lady-gaga.svg',
    initials: 'LG',
    color: '#8b5cf6', // Violet
    displayName: 'Lady Gaga',
    spotifyId: '1HY2Jd0NmPuamShAr6KMms',
    spotifyUrl: 'https://open.spotify.com/artist/1HY2Jd0NmPuamShAr6KMms',
  },
  edsheeran: {
    filename: 'ed-sheeran.svg',
    initials: 'ES',
    color: '#06b6d4', // Cyan
    displayName: 'Ed Sheeran',
    spotifyId: '6eUKZXaKkcviH0Ku9w2n3V',
    spotifyUrl: 'https://open.spotify.com/artist/6eUKZXaKkcviH0Ku9w2n3V',
  },
  maneskin: {
    filename: 'maneskin.svg',
    initials: 'MÅ',
    color: '#ef4444', // Red
    displayName: 'Måneskin',
    spotifyId: '5rSXSAkZ67PYJSvpUpkOr7',
    spotifyUrl: 'https://open.spotify.com/artist/5rSXSAkZ67PYJSvpUpkOr7',
  },
};

function createSVGAvatar(initials: string, color: string): string {
  return `<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <!-- Background circle -->
  <circle cx="200" cy="200" r="200" fill="${color}"/>
  
  <!-- Initials text -->
  <text 
    x="200" 
    y="230" 
    text-anchor="middle" 
    font-family="system-ui, -apple-system, sans-serif" 
    font-size="120" 
    font-weight="600" 
    fill="white"
  >${initials}</text>
</svg>`;
}

async function main() {
  console.log('🎨 Creating artist placeholder images...\n');

  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql, { schema });

  const avatarsDir = join(process.cwd(), 'public', 'images', 'avatars');

  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const [username, placeholderData] of Object.entries(
    ARTIST_PLACEHOLDERS
  )) {
    const filepath = join(avatarsDir, placeholderData.filename);

    // Check if image already exists
    if (existsSync(filepath)) {
      console.log(`⏭️  Already exists: ${placeholderData.filename}`);
      skipped++;
      continue;
    }

    // Create the SVG avatar
    const svgContent = createSVGAvatar(
      placeholderData.initials,
      placeholderData.color
    );

    try {
      // Save the SVG file
      writeFileSync(filepath, svgContent, 'utf8');
      console.log(`✅ Created: ${placeholderData.filename}`);
      created++;

      // Update database with local path
      await db
        .update(schema.creatorProfiles)
        .set({
          avatarUrl: `/images/avatars/${placeholderData.filename}`,
          spotifyId: placeholderData.spotifyId,
          spotifyUrl: placeholderData.spotifyUrl,
          updatedAt: new Date(),
        })
        .where(eq(schema.creatorProfiles.username, username));

      console.log(`🗄️  Updated database for ${placeholderData.displayName}`);
      updated++;
    } catch (error) {
      console.error(`❌ Failed to create ${placeholderData.filename}:`, error);
    }

    console.log('');
  }

  console.log('🎉 Placeholder creation completed!');
  console.log(`   ✅ Created: ${created}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   📊 Total: ${Object.keys(ARTIST_PLACEHOLDERS).length}`);
  console.log(`   🗄️  Database updated: ${updated}`);

  if (created > 0) {
    console.log('\n📝 Next steps:');
    console.log('   • SVG placeholders are now served from /images/avatars/');
    console.log('   • They scale perfectly and are lightweight');
    console.log('   • Database updated with local paths');
    console.log('   • Each artist has a unique color and initials');
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
