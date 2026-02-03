#!/usr/bin/env tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Download Artist Images Locally
 * Downloads Spotify artist images and saves them locally for optimization
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

// Artist image mappings with real Spotify URLs
const ARTIST_IMAGES: Record<
  string,
  {
    spotifyImageUrl: string;
    filename: string;
    spotifyId: string;
    spotifyUrl: string;
  }
> = {
  timwhite: {
    spotifyImageUrl:
      'https://i.scdn.co/image/ab6761610000e5eb8c5f7b7aa35b2a30e15f4d7e',
    filename: 'tim-white.jpg',
    spotifyId: '4Uwpa6zW3zzCSQvooQNksm',
    spotifyUrl: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
  },
  the1975: {
    spotifyImageUrl:
      'https://i.scdn.co/image/ab6761610000e5eb4f3ed3c2ba6cd4e0ecb1b6dc',
    filename: 'the-1975.jpg',
    spotifyId: '3mIj9lX2MWuHmhNCA7LQZC',
    spotifyUrl: 'https://open.spotify.com/artist/3mIj9lX2MWuHmhNCA7LQZC',
  },
  coldplay: {
    spotifyImageUrl:
      'https://i.scdn.co/image/ab6761610000e5eb1ba8fc5f5c73256e6058e6eb',
    filename: 'coldplay.jpg',
    spotifyId: '4gzpq5DPGxSnKTe4SA8HAU',
    spotifyUrl: 'https://open.spotify.com/artist/4gzpq5DPGxSnKTe4SA8HAU',
  },
  billieeilish: {
    spotifyImageUrl:
      'https://i.scdn.co/image/ab6761610000e5eb4a21b4760d2ecb7b0dcdc8da',
    filename: 'billie-eilish.jpg',
    spotifyId: '6qqNVTkY8uBg9cP3Jd8DAH',
    spotifyUrl: 'https://open.spotify.com/artist/6qqNVTkY8uBg9cP3Jd8DAH',
  },
  dualipa: {
    spotifyImageUrl:
      'https://i.scdn.co/image/ab6761610000e5eb0c68f6c95232e716f0abee8d',
    filename: 'dua-lipa.jpg',
    spotifyId: '6M2wZ9GZgrQXHCFfjv46we',
    spotifyUrl: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
  },
  johnmayer: {
    spotifyImageUrl:
      'https://i.scdn.co/image/ab6761610000e5eb16e5e350b8622204c5179cbb',
    filename: 'john-mayer.jpg',
    spotifyId: '0hEurMDQu99nJRq8pTxO14',
    spotifyUrl: 'https://open.spotify.com/artist/0hEurMDQu99nJRq8pTxO14',
  },
  ladygaga: {
    spotifyImageUrl:
      'https://i.scdn.co/image/ab6761610000e5eb0d4dd6f3586509fe68aceb73',
    filename: 'lady-gaga.jpg',
    spotifyId: '1HY2Jd0NmPuamShAr6KMms',
    spotifyUrl: 'https://open.spotify.com/artist/1HY2Jd0NmPuamShAr6KMms',
  },
  edsheeran: {
    spotifyImageUrl:
      'https://i.scdn.co/image/ab6761610000e5eb48a8c84d8bbf8d5dd2b3cf22',
    filename: 'ed-sheeran.jpg',
    spotifyId: '6eUKZXaKkcviH0Ku9w2n3V',
    spotifyUrl: 'https://open.spotify.com/artist/6eUKZXaKkcviH0Ku9w2n3V',
  },
  taylorswift: {
    spotifyImageUrl:
      'https://i.scdn.co/image/ab6761610000e5eb859e4c14fa59296c8649e0e4',
    filename: 'taylor-swift.jpg',
    spotifyId: '06HL4z0CvFAxyc27GXpf02',
    spotifyUrl: 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02',
  },
  maneskin: {
    spotifyImageUrl:
      'https://i.scdn.co/image/ab6761610000e5eb0c03b4bb99de4e50aa4bf7ff',
    filename: 'maneskin.jpg',
    spotifyId: '5rSXSAkZ67PYJSvpUpkOr7',
    spotifyUrl: 'https://open.spotify.com/artist/5rSXSAkZ67PYJSvpUpkOr7',
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
  console.log('📸 Downloading artist images locally...\n');

  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql, { schema });

  // Ensure the avatars directory exists
  const avatarsDir = join(process.cwd(), 'public', 'images', 'avatars');
  if (!existsSync(avatarsDir)) {
    mkdirSync(avatarsDir, { recursive: true });
    console.log(`📁 Created directory: ${avatarsDir}`);
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const [username, imageData] of Object.entries(ARTIST_IMAGES)) {
    const filepath = join(avatarsDir, imageData.filename);

    // Check if image already exists
    if (existsSync(filepath)) {
      console.log(`⏭️  Already exists: ${imageData.filename}`);
      skipped++;
      continue;
    }

    // Download the image
    const success = await downloadImage(imageData.spotifyImageUrl, filepath);

    if (success) {
      downloaded++;

      // Update database with local path
      try {
        await db
          .update(schema.creatorProfiles)
          .set({
            avatarUrl: `/images/avatars/${imageData.filename}`,
            spotifyId: imageData.spotifyId,
            spotifyUrl: imageData.spotifyUrl,
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

  console.log('🎉 Artist image download completed!');
  console.log(`   ✅ Downloaded: ${downloaded}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
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
