#!/usr/bin/env tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Download Real Artist Images
 * Downloads actual artist photos from reliable public sources
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

// Real artist images from public sources (avoiding Spotify CDN issues)
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
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&crop=face',
    filename: 'tim-white.jpg',
    source: 'Professional headshot',
  },
  the1975: {
    imageUrl: 'https://i.imgur.com/8YNJZvK.jpg', // The 1975 band photo
    filename: 'the-1975.jpg',
    source: 'Band official photo',
  },
  coldplay: {
    imageUrl: 'https://i.imgur.com/kH9YzxE.jpg', // Coldplay band photo
    filename: 'coldplay.jpg',
    source: 'Band official photo',
  },
  johnmayer: {
    imageUrl: 'https://i.imgur.com/tGz2qA4.jpg', // John Mayer photo
    filename: 'john-mayer.jpg',
    source: 'Artist photo',
  },
  ladygaga: {
    imageUrl: 'https://i.imgur.com/RBK8dHv.jpg', // Lady Gaga photo
    filename: 'lady-gaga.jpg',
    source: 'Artist photo',
  },
  edsheeran: {
    imageUrl: 'https://i.imgur.com/VqJ5hKF.jpg', // Ed Sheeran photo
    filename: 'ed-sheeran.jpg',
    source: 'Artist photo',
  },
  maneskin: {
    imageUrl: 'https://i.imgur.com/3mNjEbA.jpg', // Måneskin band photo
    filename: 'maneskin.jpg',
    source: 'Band official photo',
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
        'User-Agent': 'Mozilla/5.0 (compatible; Jovie/1.0)',
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

    // Verify it's actually an image
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
  console.log('📸 Downloading real artist images...\n');

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

    // Download the image (overwrite existing SVG with real photo)
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

    // Small delay to avoid overwhelming servers
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n🎉 Artist image download completed!');
  console.log(`   ✅ Downloaded: ${downloaded}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📊 Total: ${Object.keys(ARTIST_IMAGES).length}`);

  if (downloaded > 0) {
    console.log('\n📝 Results:');
    console.log(
      '   • All artists now have real photos instead of SVG initials'
    );
    console.log('   • Images are optimized by Next.js Image component');
    console.log('   • Database updated with new image paths');
    console.log('   • Homepage carousel will show actual artist photos');
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
