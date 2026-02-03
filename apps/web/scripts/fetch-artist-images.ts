#!/usr/bin/env tsx
/* eslint-disable no-restricted-imports -- Script requires full schema access */

/**
 * Fetch Artist Images from Spotify
 * Gets Spotify IDs and high-quality images for seeded artists
 */

import { neon } from '@neondatabase/serverless';
import { config as dotenvConfig } from 'dotenv';
import { eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/lib/db/schema';

// Load environment variables
dotenvConfig({ path: '.env.local', override: true });
dotenvConfig();

const DATABASE_URL = process.env.DATABASE_URL;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
  process.exit(1);
}

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error(
    '❌ Spotify credentials not configured (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)'
  );
  process.exit(1);
}

interface SpotifyArtist {
  id: string;
  name: string;
  images: Array<{ url: string; height: number; width: number }>;
  external_urls: { spotify: string };
}

interface SpotifySearchResponse {
  artists: {
    items: SpotifyArtist[];
  };
}

class SpotifyAPI {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    console.log('🔑 Getting Spotify access token...');

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get access token: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000 - 60000; // Refresh 1min early

    return this.accessToken!;
  }

  async searchArtist(artistName: string): Promise<SpotifyArtist | null> {
    const token = await this.getAccessToken();
    const encodedName = encodeURIComponent(artistName);

    console.log(`🔍 Searching for: ${artistName}`);

    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodedName}&type=artist&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error(
        `❌ Search failed for ${artistName}: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data: SpotifySearchResponse = await response.json();

    if (data.artists.items.length === 0) {
      console.log(`⚠️  No results found for: ${artistName}`);
      return null;
    }

    const artist = data.artists.items[0];
    console.log(`✅ Found: ${artist.name} (ID: ${artist.id})`);

    return artist;
  }

  getBestImage(artist: SpotifyArtist): string | null {
    if (!artist.images || artist.images.length === 0) {
      return null;
    }

    // Sort by size (descending) and get the largest image
    const sortedImages = artist.images
      .filter(img => img.url && img.height && img.width)
      .sort((a, b) => b.height * b.width - a.height * a.width);

    return sortedImages[0]?.url || null;
  }
}

async function main() {
  console.log('🎵 Fetching artist images from Spotify...\n');

  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql, { schema });
  const spotify = new SpotifyAPI();

  try {
    // Get all creator profiles that need images
    const profiles = await db
      .select()
      .from(schema.creatorProfiles)
      .where(isNull(schema.creatorProfiles.avatarUrl))
      .orderBy(schema.creatorProfiles.displayName);

    console.log(`📊 Found ${profiles.length} artists needing images\n`);

    let updated = 0;
    let skipped = 0;

    for (const profile of profiles) {
      // Skip empty display names
      if (!profile.displayName?.trim()) {
        console.log(
          `⏭️  Skipping profile with no display name (@${profile.username})`
        );
        skipped++;
        continue;
      }

      try {
        // Search for the artist on Spotify
        const spotifyArtist = await spotify.searchArtist(profile.displayName);

        if (!spotifyArtist) {
          skipped++;
          console.log('');
          continue;
        }

        // Get the best quality image
        const imageUrl = spotify.getBestImage(spotifyArtist);

        if (!imageUrl) {
          console.log(`⚠️  No images available for ${spotifyArtist.name}`);
          skipped++;
          console.log('');
          continue;
        }

        // Update the profile with Spotify data
        await db
          .update(schema.creatorProfiles)
          .set({
            spotifyId: spotifyArtist.id,
            avatarUrl: imageUrl,
            spotifyUrl: spotifyArtist.external_urls.spotify,
            updatedAt: new Date(),
          })
          .where(eq(schema.creatorProfiles.id, profile.id));

        console.log(`📸 Updated: ${profile.displayName}`);
        console.log(`   🎧 Spotify ID: ${spotifyArtist.id}`);
        console.log(`   🖼️  Image: ${imageUrl}`);

        updated++;
        console.log('');

        // Rate limiting: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Error updating ${profile.displayName}:`, error);
        skipped++;
        console.log('');
      }
    }

    console.log('🎉 Artist image fetching completed!');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📊 Total: ${profiles.length}`);
  } catch (error) {
    console.error('❌ Error fetching artist images:', error);
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
