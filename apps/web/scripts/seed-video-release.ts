#!/usr/bin/env -S tsx
/**
 * One-off script to insert a music_video demo release for testing.
 * Run: doppler run -- tsx scripts/seed-video-release.ts
 */

/* eslint-disable no-restricted-imports -- Script requires full schema access */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

const { creatorProfiles, discogReleases, providerLinks } = schema;

async function main() {
  // Find any claimed demo profile to attach the video release to
  const profiles = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.isClaimed, true))
    .limit(5);

  console.log(
    `Found ${profiles.length} claimed profiles:`,
    profiles.map(p => p.username)
  );

  if (profiles.length === 0) {
    // Try without isClaimed filter
    const allProfiles = await db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .limit(5);
    console.log(
      `All profiles (${allProfiles.length}):`,
      allProfiles.map(p => p.username)
    );
    if (allProfiles.length === 0) {
      console.error('No profiles found at all. Check DB connection.');
      process.exit(1);
    }
  }

  const profile =
    profiles[0] ??
    (
      await db
        .select({
          id: creatorProfiles.id,
          username: creatorProfiles.usernameNormalized,
        })
        .from(creatorProfiles)
        .limit(1)
    )[0];

  if (!profile) {
    console.error('No profiles found. Run seed-demo-account first.');
    process.exit(1);
  }

  console.log(`Found profile: ${profile.id}`);

  // Insert the music video release
  const [release] = await db
    .insert(discogReleases)
    .values({
      creatorProfileId: profile.id,
      title: 'Miracle (Official Music Video)',
      slug: 'demo-miracle-official-music-video',
      releaseType: 'music_video',
      releaseDate: new Date('2023-04-14'),
      artworkUrl: 'https://i.ytimg.com/vi/v7GHn2WJCM4/maxresdefault.jpg',
      totalTracks: 0,
      metadata: {
        youtubeVideoId: 'v7GHn2WJCM4',
        youtubeThumbnailUrl:
          'https://i.ytimg.com/vi/v7GHn2WJCM4/maxresdefault.jpg',
        youtubeChannelId: 'UCIjYyZxkFucP_W-tmXg_ILw',
        youtubeChannelName: 'Calvin Harris',
        duration: 219,
      },
      sourceType: 'manual',
    })
    .onConflictDoNothing()
    .returning({ id: discogReleases.id });

  if (!release) {
    console.log('Release already exists (slug conflict). Skipping.');
    process.exit(0);
  }

  console.log(`Created music_video release: ${release.id}`);

  // Add YouTube provider link
  await db
    .insert(providerLinks)
    .values({
      providerId: 'youtube',
      ownerType: 'release',
      releaseId: release.id,
      url: 'https://www.youtube.com/watch?v=v7GHn2WJCM4',
      isPrimary: true,
      sourceType: 'manual',
    })
    .onConflictDoNothing();

  console.log('Added YouTube provider link');
  console.log(
    `\nTest URL: http://localhost:3000/${profile.username}/demo-miracle-official-music-video`
  );
  process.exit(0);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
