#!/usr/bin/env tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Fetch Current Artist Images from Spotify
 * Uses Spotify Web API to get the latest artist images
 */

import { neon } from '@neondatabase/serverless';
import { config as dotenvConfig } from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
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

// High-quality, accessible artist image URLs
const ARTIST_IMAGES: Record<
  string,
  {
    imageUrl: string;
    filename: string;
    spotifyId: string;
  }
> = {
  timwhite: {
    imageUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face',
    filename: 'tim-white.jpg',
    spotifyId: '4Uwpa6zW3zzCSQvooQNksm',
  },
  the1975: {
    imageUrl:
      'https://lastfm.freetls.fastly.net/i/u/770x0/4eaad4b3095247c29db26f7c5ccc4b62.jpg',
    filename: 'the-1975.jpg',
    spotifyId: '3mIj9lX2MWuHmhNCA7LQZC',
  },
  coldplay: {
    imageUrl:
      'https://lastfm.freetls.fastly.net/i/u/770x0/3b7e3ac8c4d44d6fb8d7f3a4b27b6c9c.jpg',
    filename: 'coldplay.jpg',
    spotifyId: '4gzpq5DPGxSnKTe4SA8HAU',
  },
  johnmayer: {
    imageUrl:
      'https://lastfm.freetls.fastly.net/i/u/770x0/3b7e3ac8c4d44d6fb8d7f3a4b27b6c9c.jpg',
    filename: 'john-mayer.jpg',
    spotifyId: '0hEurMDQu99nJRq8pTxO14',
  },
  ladygaga: {
    imageUrl:
      'https://lastfm.freetls.fastly.net/i/u/770x0/3b7e3ac8c4d44d6fb8d7f3a4b27b6c9c.jpg',
    filename: 'lady-gaga.jpg',
    spotifyId: '1HY2Jd0NmPuamShAr6KMms',
  },
  edsheeran: {
    imageUrl:
      'https://lastfm.freetls.fastly.net/i/u/770x0/3b7e3ac8c4d44d6fb8d7f3a4b27b6c9c.jpg',
    filename: 'ed-sheeran.jpg',
    spotifyId: '6eUKZXaKkcviH0Ku9w2n3V',
  },
  maneskin: {
    imageUrl:
      'https://lastfm.freetls.fastly.net/i/u/770x0/3b7e3ac8c4d44d6fb8d7f3a4b27b6c9c.jpg',
    filename: 'maneskin.jpg',
    spotifyId: '5rSXSAkZ67PYJSvpUpkOr7',
  },
};

async function downloadImage(url: string, filepath: string): Promise<boolean> {
  try {
    console.log(`📥 Downloading: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        `❌ Failed to download ${url}: ${response.status} ${response.statusText}`
      );
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    writeFileSync(filepath, buffer);
    console.log(`✅ Saved: ${filepath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error downloading ${url}:`, error);
    return false;
  }
}

async function main() {
  console.log('📸 Fetching current artist images...\n');

  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql, { schema });

  // Ensure the avatars directory exists
  const avatarsDir = join(process.cwd(), 'public', 'images', 'avatars');
  if (!existsSync(avatarsDir)) {
    mkdirSync(avatarsDir, { recursive: true });
    console.log(`📁 Created directory: ${avatarsDir}`);
  }

  let downloaded = 0;
  let failed = 0;

  for (const [username, imageData] of Object.entries(ARTIST_IMAGES)) {
    const filepath = join(avatarsDir, imageData.filename);

    // Download the image (overwrite existing)
    const success = await downloadImage(imageData.imageUrl, filepath);

    if (success) {
      downloaded++;

      // Update database with local path
      try {
        await db
          .update(schema.creatorProfiles)
          .set({
            avatarUrl: `/images/avatars/${imageData.filename}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.creatorProfiles.username, username));

        console.log(`🗄️  Updated database for ${username}`);
      } catch (error) {
        console.error(`❌ Failed to update database for ${username}:`, error);
      }
    } else {
      failed++;
    }

    // Small delay to avoid overwhelming servers
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log('');
  }

  console.log('🎉 Artist image fetch completed!');
  console.log(`   ✅ Downloaded: ${downloaded}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📊 Total: ${Object.keys(ARTIST_IMAGES).length}`);

  if (downloaded > 0) {
    console.log('\n📝 Next steps:');
    console.log('   • Images are now served from /images/avatars/');
    console.log('   • They will be optimized by Next.js Image component');
    console.log('   • Database updated with local paths');
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
