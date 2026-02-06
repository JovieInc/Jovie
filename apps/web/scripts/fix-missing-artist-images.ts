#!/usr/bin/env tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Fix Missing Artist Images
 * Downloads replacement images for The 1975 and Coldplay
 */

import { neon } from '@neondatabase/serverless';
import { config as dotenvConfig } from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { writeFileSync } from 'fs';
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

// Replacement images for The 1975 and Coldplay
const REPLACEMENT_IMAGES: Record<
  string,
  {
    imageUrl: string;
    filename: string;
  }
> = {
  the1975: {
    imageUrl: 'https://picsum.photos/seed/the1975band/400/400',
    filename: 'the-1975.jpg',
  },
  coldplay: {
    imageUrl: 'https://picsum.photos/seed/coldplayband/400/400',
    filename: 'coldplay.jpg',
  },
};

async function downloadImage(
  url: string,
  filepath: string,
  artist: string
): Promise<boolean> {
  try {
    console.log(`📥 Downloading ${artist}: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`❌ ${artist}: ${response.status} ${response.statusText}`);
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length < 5000) {
      console.error(`❌ ${artist}: Image too small (${buffer.length} bytes)`);
      return false;
    }

    writeFileSync(filepath, buffer);
    console.log(`✅ ${artist}: Saved ${Math.round(buffer.length / 1024)}KB`);
    return true;
  } catch (error) {
    console.error(`❌ ${artist}: Error downloading:`, error);
    return false;
  }
}

async function main() {
  console.log('🔧 Fixing missing artist images...\n');

  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql, { schema });
  const avatarsDir = join(process.cwd(), 'public', 'images', 'avatars');

  for (const [username, imageData] of Object.entries(REPLACEMENT_IMAGES)) {
    const filepath = join(avatarsDir, imageData.filename);

    console.log(`🎨 Processing ${username}...`);

    const success = await downloadImage(imageData.imageUrl, filepath, username);

    if (success) {
      // Update database
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
            `🗄️  Updated ${result[0].displayName} (@${result[0].username})`
          );
        }
      } catch (error) {
        console.error(`❌ Database update failed for ${username}:`, error);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('');
  }

  console.log('✅ Fixed missing artist images!');
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}
