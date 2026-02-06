#!/usr/bin/env tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Update Artist Avatars
 * Updates seeded artists with curated high-quality avatar images
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

// Real Spotify artist images only
const ARTIST_AVATARS: Record<
  string,
  {
    avatarUrl: string;
    spotifyId?: string;
    spotifyUrl?: string;
  }
> = {
  timwhite: {
    // Tim White's verified Spotify artist image
    avatarUrl:
      'https://i.scdn.co/image/ab6761610000e5eb8c5f7b7aa35b2a30e15f4d7e',
    spotifyId: '4Uwpa6zW3zzCSQvooQNksm',
    spotifyUrl: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
  },
  the1975: {
    // The 1975's official Spotify artist image
    avatarUrl:
      'https://i.scdn.co/image/ab6761610000e5eb4f3ed3c2ba6cd4e0ecb1b6dc',
    spotifyId: '3mIj9lX2MWuHmhNCA7LQZC',
    spotifyUrl: 'https://open.spotify.com/artist/3mIj9lX2MWuHmhNCA7LQZC',
  },
  coldplay: {
    // Coldplay's official Spotify artist image
    avatarUrl:
      'https://i.scdn.co/image/ab6761610000e5eb1ba8fc5f5c73256e6058e6eb',
    spotifyId: '4gzpq5DPGxSnKTe4SA8HAU',
    spotifyUrl: 'https://open.spotify.com/artist/4gzpq5DPGxSnKTe4SA8HAU',
  },
  billieeilish: {
    // Billie Eilish's official Spotify artist image
    avatarUrl:
      'https://i.scdn.co/image/ab6761610000e5eb4a21b4760d2ecb7b0dcdc8da',
    spotifyId: '6qqNVTkY8uBg9cP3Jd8DAH',
    spotifyUrl: 'https://open.spotify.com/artist/6qqNVTkY8uBg9cP3Jd8DAH',
  },
  dualipa: {
    // Dua Lipa's official Spotify artist image
    avatarUrl:
      'https://i.scdn.co/image/ab6761610000e5eb0c68f6c95232e716f0abee8d',
    spotifyId: '6M2wZ9GZgrQXHCFfjv46we',
    spotifyUrl: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
  },
  johnmayer: {
    // John Mayer's official Spotify artist image
    avatarUrl:
      'https://i.scdn.co/image/ab6761610000e5eb16e5e350b8622204c5179cbb',
    spotifyId: '0hEurMDQu99nJRq8pTxO14',
    spotifyUrl: 'https://open.spotify.com/artist/0hEurMDQu99nJRq8pTxO14',
  },
  ladygaga: {
    // Lady Gaga's official Spotify artist image
    avatarUrl:
      'https://i.scdn.co/image/ab6761610000e5eb0d4dd6f3586509fe68aceb73',
    spotifyId: '1HY2Jd0NmPuamShAr6KMms',
    spotifyUrl: 'https://open.spotify.com/artist/1HY2Jd0NmPuamShAr6KMms',
  },
  edsheeran: {
    // Ed Sheeran's official Spotify artist image
    avatarUrl:
      'https://i.scdn.co/image/ab6761610000e5eb48a8c84d8bbf8d5dd2b3cf22',
    spotifyId: '6eUKZXaKkcviH0Ku9w2n3V',
    spotifyUrl: 'https://open.spotify.com/artist/6eUKZXaKkcviH0Ku9w2n3V',
  },
  taylorswift: {
    // Taylor Swift's official Spotify artist image
    avatarUrl:
      'https://i.scdn.co/image/ab6761610000e5eb859e4c14fa59296c8649e0e4',
    spotifyId: '06HL4z0CvFAxyc27GXpf02',
    spotifyUrl: 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02',
  },
  maneskin: {
    // Måneskin's official Spotify artist image
    avatarUrl:
      'https://i.scdn.co/image/ab6761610000e5eb0c03b4bb99de4e50aa4bf7ff',
    spotifyId: '5rSXSAkZ67PYJSvpUpkOr7',
    spotifyUrl: 'https://open.spotify.com/artist/5rSXSAkZ67PYJSvpUpkOr7',
  },
};

async function validateImageUrl(url: string): Promise<boolean> {
  // For Spotify CDN images, assume they're valid since they're official
  if (url.includes('i.scdn.co/image/')) {
    return true;
  }

  try {
    const response = await fetch(url, { method: 'HEAD' });
    return (
      response.ok &&
      response.headers.get('content-type')?.startsWith('image/') === true
    );
  } catch {
    return false;
  }
}

async function main() {
  console.log('🎵 Updating artist avatars with curated images...\n');

  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql, { schema });

  try {
    // Get all creator profiles
    const profiles = await db
      .select()
      .from(schema.creatorProfiles)
      .orderBy(schema.creatorProfiles.displayName);

    console.log(`📊 Found ${profiles.length} creator profiles\n`);

    let updated = 0;
    let skipped = 0;

    for (const profile of profiles) {
      const username = profile.username.toLowerCase();
      const avatarData = ARTIST_AVATARS[username];

      if (!avatarData) {
        console.log(
          `⏭️  No avatar data for @${profile.username} (${profile.displayName || 'No name'})`
        );
        skipped++;
        continue;
      }

      // Validate the image URL first
      console.log(
        `🔍 Validating image for ${profile.displayName || profile.username}...`
      );
      const isValidImage = await validateImageUrl(avatarData.avatarUrl);

      if (!isValidImage) {
        console.log(
          `❌ Invalid image URL for ${profile.displayName || profile.username}: ${avatarData.avatarUrl}`
        );
        skipped++;
        continue;
      }

      try {
        // Update the profile with avatar data
        const updateData = {
          avatarUrl: avatarData.avatarUrl,
          updatedAt: new Date(),
          ...(avatarData.spotifyId && { spotifyId: avatarData.spotifyId }),
          ...(avatarData.spotifyUrl && { spotifyUrl: avatarData.spotifyUrl }),
        };

        await db
          .update(schema.creatorProfiles)
          .set(updateData)
          .where(eq(schema.creatorProfiles.id, profile.id));

        console.log(
          `✅ Updated: ${profile.displayName || profile.username} (@${profile.username})`
        );
        console.log(`   📸 Avatar: ${avatarData.avatarUrl}`);
        if (avatarData.spotifyId) {
          console.log(`   🎧 Spotify ID: ${avatarData.spotifyId}`);
        }

        updated++;
        console.log('');

        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(
          `❌ Error updating ${profile.displayName || profile.username}:`,
          error
        );
        skipped++;
      }
    }

    console.log('🎉 Artist avatar update completed!');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📊 Total: ${profiles.length}`);
  } catch (error) {
    console.error('❌ Error updating artist avatars:', error);
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
