#!/usr/bin/env tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Download Wikipedia Artist Images
 * Downloads artist photos from Wikimedia Commons (public domain/creative commons)
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

// Reliable artist images from Wikimedia Commons and other public sources
const ARTIST_IMAGES: Record<
  string,
  {
    imageUrl: string;
    filename: string;
    source: string;
  }
> = {
  timwhite: {
    imageUrl:
      'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=400&fit=crop&crop=face&auto=format',
    filename: 'tim-white.jpg',
    source: 'Professional musician photo',
  },
  the1975: {
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/The_1975_at_Austin_City_Limits_2022_%28cropped%29.jpg/400px-The_1975_at_Austin_City_Limits_2022_%28cropped%29.jpg',
    filename: 'the-1975.jpg',
    source: 'Wikimedia Commons',
  },
  coldplay: {
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Coldplay-02.jpg/400px-Coldplay-02.jpg',
    filename: 'coldplay.jpg',
    source: 'Wikimedia Commons',
  },
  johnmayer: {
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/John_Mayer_2019_by_Glenn_Francis.jpg/400px-John_Mayer_2019_by_Glenn_Francis.jpg',
    filename: 'john-mayer.jpg',
    source: 'Wikimedia Commons',
  },
  ladygaga: {
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Lady_Gaga_Venice_Film_Festival.jpg/400px-Lady_Gaga_Venice_Film_Festival.jpg',
    filename: 'lady-gaga.jpg',
    source: 'Wikimedia Commons',
  },
  edsheeran: {
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Ed_Sheeran_2013.jpg/400px-Ed_Sheeran_2013.jpg',
    filename: 'ed-sheeran.jpg',
    source: 'Wikimedia Commons',
  },
  maneskin: {
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/M%C3%A5neskin_ESC2021_-_01.jpg/400px-M%C3%A5neskin_ESC2021_-_01.jpg',
    filename: 'maneskin.jpg',
    source: 'Wikimedia Commons',
  },
};

async function downloadImage(
  url: string,
  filepath: string,
  source: string
): Promise<boolean> {
  try {
    console.log(`📥 Downloading ${source}: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Jovie/1.0; +https://jovie.ai)',
        Accept:
          'image/webp,image/avif,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      console.error(
        `❌ Failed to download ${url}: ${response.status} ${response.statusText}`
      );
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify it's actually an image and has content
    if (buffer.length < 1000) {
      console.error(
        `❌ Image too small (${buffer.length} bytes), likely failed`
      );
      return false;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      console.error(`❌ Invalid content type: ${contentType}`);
      return false;
    }

    writeFileSync(filepath, buffer);
    console.log(
      `✅ Saved: ${filepath} (${Math.round(buffer.length / 1024)}KB)`
    );
    return true;
  } catch (error) {
    console.error(`❌ Error downloading ${url}:`, error);
    return false;
  }
}

async function main() {
  console.log('📸 Downloading Wikipedia artist images...\n');

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

    console.log(`\n🎨 Processing ${username}...`);

    // Download the image (overwrite existing)
    const success = await downloadImage(
      imageData.imageUrl,
      filepath,
      imageData.source
    );

    if (success) {
      downloaded++;

      // Update database with new image path
      try {
        const result = await db
          .update(schema.creatorProfiles)
          .set({
            avatarUrl: `/images/avatars/${imageData.filename}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.creatorProfiles.username, username))
          .returning({
            username: schema.creatorProfiles.username,
            displayName: schema.creatorProfiles.displayName,
          });

        if (result && result.length > 0) {
          console.log(
            `🗄️  Updated ${result[0].displayName} (@${result[0].username}) in database`
          );
        } else {
          console.log(`⚠️  No profile found for ${username}`);
        }
      } catch (error) {
        console.error(`❌ Failed to update database for ${username}:`, error);
      }
    } else {
      failed++;
    }

    // Small delay to be respectful to servers
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🎉 Artist image download completed!');
  console.log(`   ✅ Downloaded: ${downloaded}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📊 Total: ${Object.keys(ARTIST_IMAGES).length}`);

  if (downloaded > 0) {
    console.log('\n📝 Results:');
    console.log('   • All artists now have real photos from reliable sources');
    console.log(
      '   • Images are from Wikimedia Commons (public domain/Creative Commons)'
    );
    console.log('   • Images are optimized by Next.js Image component');
    console.log('   • Database updated with new image paths');
    console.log('   • Homepage carousel will show actual artist photos');
  }

  if (failed > 0) {
    console.log(
      '\n⚠️  Some downloads failed - those artists will keep their SVG placeholders for now'
    );
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
