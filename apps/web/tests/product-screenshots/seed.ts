/**
 * Product Screenshot Seed Data
 *
 * Seeds the E2E test user with rich, realistic release data
 * for generating marketing screenshots. This is designed to be
 * run before the screenshot Playwright spec.
 *
 * Usage:
 *   pnpm --filter web screenshots
 *
 * ESLint exceptions:
 * - no-restricted-imports: Seed scripts import full schema for flexibility
 */

/* eslint-disable no-restricted-imports */
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/lib/db/schema';

const { creatorProfiles, discogReleases, discogTracks, providerLinks } = schema;

// ---------------------------------------------------------------------------
// Artwork URLs – using Unsplash images already allowed in the CSP
// ---------------------------------------------------------------------------
const ARTWORK = {
  midnightArchitecture:
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=640&q=80',
  glassCathedral:
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=640&q=80',
  velvetHorizon:
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=640&q=80',
  echoesInAmber:
    'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=640&q=80',
  dissolve:
    'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=640&q=80',
  phantomFrequencies:
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=640&q=80',
  starfall:
    'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=640&q=80',
  neonPulse:
    'https://images.unsplash.com/photo-1504898770365-14faca6a7320?auto=format&fit=crop&w=640&q=80',
  celestial:
    'https://images.unsplash.com/photo-1446057032654-9d8885db76c6?auto=format&fit=crop&w=640&q=80',
  atlasOfDreams:
    'https://images.unsplash.com/photo-1501612780327-45045538702b?auto=format&fit=crop&w=640&q=80',
} as const;

// ---------------------------------------------------------------------------
// Release definitions – a coherent discography for a fictional artist
// ---------------------------------------------------------------------------
interface ScreenshotRelease {
  title: string;
  slug: string;
  releaseType: 'single' | 'ep' | 'album';
  releaseDate: Date;
  artworkUrl: string;
  label: string | null;
  upc: string | null;
  totalTracks: number;
  spotifyPopularity: number;
  providers: Record<string, string>;
  /** Track listing (for albums/EPs shown in sidebar) */
  tracks?: Array<{
    title: string;
    trackNumber: number;
    durationMs: number;
    isrc: string | null;
    isExplicit: boolean;
    providers: Record<string, string>;
  }>;
}

const SCREENSHOT_RELEASES: ScreenshotRelease[] = [
  {
    title: 'Midnight Architecture',
    slug: 'midnight-architecture',
    releaseType: 'album',
    releaseDate: new Date('2025-11-15'),
    artworkUrl: ARTWORK.midnightArchitecture,
    label: 'Neon Collective',
    upc: '0196588312458',
    totalTracks: 12,
    spotifyPopularity: 84,
    providers: {
      spotify: 'https://open.spotify.com/album/3mH6qwIy9crq0I9YQbOuDf',
      apple_music:
        'https://music.apple.com/us/album/midnight-architecture/1712345678',
      youtube: 'https://music.youtube.com/playlist?list=OLAK5uy_midnight_arch',
      soundcloud: 'https://soundcloud.com/ariamusic/sets/midnight-architecture',
      deezer: 'https://www.deezer.com/album/546372819',
      tidal: 'https://tidal.com/browse/album/298765432',
      amazon_music: 'https://music.amazon.com/albums/B0DARCH1T3CT',
    },
    tracks: [
      {
        title: 'Opening',
        trackNumber: 1,
        durationMs: 222000,
        isrc: 'USRC12500001',
        isExplicit: false,
        providers: { spotify: 'https://open.spotify.com/track/1aOpening' },
      },
      {
        title: 'Glass Meridian',
        trackNumber: 2,
        durationMs: 255000,
        isrc: 'USRC12500002',
        isExplicit: false,
        providers: {
          spotify: 'https://open.spotify.com/track/2aGlassMeridian',
          apple_music:
            'https://music.apple.com/us/album/glass-meridian/1712345678?i=1',
        },
      },
      {
        title: 'Concrete Dreams',
        trackNumber: 3,
        durationMs: 238000,
        isrc: 'USRC12500003',
        isExplicit: false,
        providers: {
          spotify: 'https://open.spotify.com/track/3aConcreteDreams',
        },
      },
      {
        title: 'After Hours',
        trackNumber: 4,
        durationMs: 301000,
        isrc: 'USRC12500004',
        isExplicit: true,
        providers: {
          spotify: 'https://open.spotify.com/track/4aAfterHours',
          apple_music:
            'https://music.apple.com/us/album/after-hours/1712345678?i=4',
        },
      },
      {
        title: 'Fractured Light',
        trackNumber: 5,
        durationMs: 268000,
        isrc: 'USRC12500005',
        isExplicit: false,
        providers: {
          spotify: 'https://open.spotify.com/track/5aFracturedLight',
        },
      },
      {
        title: 'Digital Rain',
        trackNumber: 6,
        durationMs: 213000,
        isrc: 'USRC12500006',
        isExplicit: false,
        providers: { spotify: 'https://open.spotify.com/track/6aDigitalRain' },
      },
      {
        title: 'Skyline',
        trackNumber: 7,
        durationMs: 287000,
        isrc: 'USRC12500007',
        isExplicit: false,
        providers: {
          spotify: 'https://open.spotify.com/track/7aSkyline',
          apple_music:
            'https://music.apple.com/us/album/skyline/1712345678?i=7',
        },
      },
      {
        title: 'The In Between',
        trackNumber: 8,
        durationMs: 201000,
        isrc: 'USRC12500008',
        isExplicit: false,
        providers: { spotify: 'https://open.spotify.com/track/8aTheInBetween' },
      },
      {
        title: 'Parallel Lives',
        trackNumber: 9,
        durationMs: 296000,
        isrc: 'USRC12500009',
        isExplicit: false,
        providers: {
          spotify: 'https://open.spotify.com/track/9aParallelLives',
        },
      },
      {
        title: 'Monochrome',
        trackNumber: 10,
        durationMs: 224000,
        isrc: 'USRC12500010',
        isExplicit: false,
        providers: { spotify: 'https://open.spotify.com/track/10aMonochrome' },
      },
      {
        title: 'Architecture',
        trackNumber: 11,
        durationMs: 372000,
        isrc: 'USRC12500011',
        isExplicit: false,
        providers: {
          spotify: 'https://open.spotify.com/track/11aArchitecture',
          apple_music:
            'https://music.apple.com/us/album/architecture/1712345678?i=11',
        },
      },
      {
        title: 'Until Dawn',
        trackNumber: 12,
        durationMs: 338000,
        isrc: 'USRC12500012',
        isExplicit: false,
        providers: { spotify: 'https://open.spotify.com/track/12aUntilDawn' },
      },
    ],
  },
  {
    title: 'Glass Cathedral',
    slug: 'glass-cathedral',
    releaseType: 'single',
    releaseDate: new Date('2025-10-03'),
    artworkUrl: ARTWORK.glassCathedral,
    label: 'Neon Collective',
    upc: '0196588312465',
    totalTracks: 1,
    spotifyPopularity: 91,
    providers: {
      spotify: 'https://open.spotify.com/track/6zGlassCathedral',
      apple_music:
        'https://music.apple.com/us/album/glass-cathedral/1723456789?i=1',
      youtube: 'https://music.youtube.com/watch?v=xGlassCathed',
      soundcloud: 'https://soundcloud.com/ariamusic/glass-cathedral',
      deezer: 'https://www.deezer.com/track/987654321',
      tidal: 'https://tidal.com/browse/track/312456789',
    },
  },
  {
    title: 'Velvet Horizon',
    slug: 'velvet-horizon',
    releaseType: 'single',
    releaseDate: new Date('2025-08-18'),
    artworkUrl: ARTWORK.velvetHorizon,
    label: 'Neon Collective',
    upc: '0196588312472',
    totalTracks: 1,
    spotifyPopularity: 88,
    providers: {
      spotify: 'https://open.spotify.com/track/7zVelvetHorizon',
      apple_music:
        'https://music.apple.com/us/album/velvet-horizon/1734567890?i=1',
      youtube: 'https://music.youtube.com/watch?v=yVelvetHrzn',
      soundcloud: 'https://soundcloud.com/ariamusic/velvet-horizon',
      deezer: 'https://www.deezer.com/track/876543210',
    },
  },
  {
    title: 'Echoes in Amber',
    slug: 'echoes-in-amber',
    releaseType: 'ep',
    releaseDate: new Date('2025-07-22'),
    artworkUrl: ARTWORK.echoesInAmber,
    label: 'Neon Collective',
    upc: '0196588312489',
    totalTracks: 5,
    spotifyPopularity: 76,
    providers: {
      spotify: 'https://open.spotify.com/album/8zEchoesInAmber',
      apple_music:
        'https://music.apple.com/us/album/echoes-in-amber/1745678901',
      youtube: 'https://music.youtube.com/playlist?list=OLAK5uy_echoes_amber',
      tidal: 'https://tidal.com/browse/album/345678901',
      amazon_music: 'https://music.amazon.com/albums/B0DECH0ES1N',
    },
    tracks: [
      {
        title: 'Amber Glow',
        trackNumber: 1,
        durationMs: 245000,
        isrc: 'USRC12500020',
        isExplicit: false,
        providers: { spotify: 'https://open.spotify.com/track/20aAmberGlow' },
      },
      {
        title: 'Resonance',
        trackNumber: 2,
        durationMs: 278000,
        isrc: 'USRC12500021',
        isExplicit: false,
        providers: { spotify: 'https://open.spotify.com/track/21aResonance' },
      },
      {
        title: 'Warm Static',
        trackNumber: 3,
        durationMs: 312000,
        isrc: 'USRC12500022',
        isExplicit: false,
        providers: { spotify: 'https://open.spotify.com/track/22aWarmStatic' },
      },
      {
        title: 'Fading Signal',
        trackNumber: 4,
        durationMs: 198000,
        isrc: 'USRC12500023',
        isExplicit: false,
        providers: {
          spotify: 'https://open.spotify.com/track/23aFadingSignal',
        },
      },
      {
        title: 'Echoes',
        trackNumber: 5,
        durationMs: 356000,
        isrc: 'USRC12500024',
        isExplicit: false,
        providers: { spotify: 'https://open.spotify.com/track/24aEchoes' },
      },
    ],
  },
  {
    title: 'Dissolve',
    slug: 'dissolve',
    releaseType: 'single',
    releaseDate: new Date('2025-05-30'),
    artworkUrl: ARTWORK.dissolve,
    label: 'Neon Collective',
    upc: null,
    totalTracks: 1,
    spotifyPopularity: 82,
    providers: {
      spotify: 'https://open.spotify.com/track/9zDissolve',
      apple_music: 'https://music.apple.com/us/album/dissolve/1756789012?i=1',
      youtube: 'https://music.youtube.com/watch?v=zDissolve01',
      soundcloud: 'https://soundcloud.com/ariamusic/dissolve',
    },
  },
  {
    title: 'Phantom Frequencies',
    slug: 'phantom-frequencies',
    releaseType: 'album',
    releaseDate: new Date('2024-03-08'),
    artworkUrl: ARTWORK.phantomFrequencies,
    label: 'Neon Collective',
    upc: '0196588298765',
    totalTracks: 10,
    spotifyPopularity: 79,
    providers: {
      spotify: 'https://open.spotify.com/album/10zPhantomFreqs',
      apple_music:
        'https://music.apple.com/us/album/phantom-frequencies/1667890123',
      youtube: 'https://music.youtube.com/playlist?list=OLAK5uy_phantom_freq',
      soundcloud: 'https://soundcloud.com/ariamusic/sets/phantom-frequencies',
      deezer: 'https://www.deezer.com/album/432109876',
      tidal: 'https://tidal.com/browse/album/267890123',
      amazon_music: 'https://music.amazon.com/albums/B0DPHANT0M',
      bandcamp: 'https://ariamusic.bandcamp.com/album/phantom-frequencies',
    },
  },
  {
    title: 'Starfall',
    slug: 'starfall',
    releaseType: 'ep',
    releaseDate: new Date('2024-09-12'),
    artworkUrl: ARTWORK.starfall,
    label: null,
    upc: '0196588305678',
    totalTracks: 4,
    spotifyPopularity: 71,
    providers: {
      spotify: 'https://open.spotify.com/album/11zStarfall',
      apple_music: 'https://music.apple.com/us/album/starfall/1689012345',
      youtube: 'https://music.youtube.com/playlist?list=OLAK5uy_starfall_ep',
      soundcloud: 'https://soundcloud.com/ariamusic/sets/starfall',
    },
  },
  {
    title: 'Neon Pulse',
    slug: 'neon-pulse',
    releaseType: 'single',
    releaseDate: new Date('2026-01-24'),
    artworkUrl: ARTWORK.neonPulse,
    label: 'Neon Collective',
    upc: null,
    totalTracks: 1,
    spotifyPopularity: 67,
    providers: {
      spotify: 'https://open.spotify.com/track/12zNeonPulse',
      apple_music: 'https://music.apple.com/us/album/neon-pulse/1790123456?i=1',
      youtube: 'https://music.youtube.com/watch?v=aNeonPulse1',
    },
  },
  {
    title: 'Celestial',
    slug: 'celestial',
    releaseType: 'single',
    releaseDate: new Date('2024-06-15'),
    artworkUrl: ARTWORK.celestial,
    label: 'Neon Collective',
    upc: '0196588309876',
    totalTracks: 1,
    spotifyPopularity: 85,
    providers: {
      spotify: 'https://open.spotify.com/track/13zCelestial',
      apple_music: 'https://music.apple.com/us/album/celestial/1701234567?i=1',
      youtube: 'https://music.youtube.com/watch?v=bCelestial1',
      soundcloud: 'https://soundcloud.com/ariamusic/celestial',
      deezer: 'https://www.deezer.com/track/321098765',
      tidal: 'https://tidal.com/browse/track/289012345',
    },
  },
  {
    title: 'Atlas of Dreams',
    slug: 'atlas-of-dreams',
    releaseType: 'album',
    releaseDate: new Date('2023-05-20'),
    artworkUrl: ARTWORK.atlasOfDreams,
    label: 'Neon Collective',
    upc: '0196588287654',
    totalTracks: 14,
    spotifyPopularity: 73,
    providers: {
      spotify: 'https://open.spotify.com/album/14zAtlasOfDreams',
      apple_music:
        'https://music.apple.com/us/album/atlas-of-dreams/1612345678',
      youtube: 'https://music.youtube.com/playlist?list=OLAK5uy_atlas_dreams',
      soundcloud: 'https://soundcloud.com/ariamusic/sets/atlas-of-dreams',
      deezer: 'https://www.deezer.com/album/210987654',
      tidal: 'https://tidal.com/browse/album/256789012',
      amazon_music: 'https://music.amazon.com/albums/B0DATL4S01',
      bandcamp: 'https://ariamusic.bandcamp.com/album/atlas-of-dreams',
      beatport: 'https://www.beatport.com/release/atlas-of-dreams/4012345',
    },
  },
];

// ---------------------------------------------------------------------------
// Seed logic
// ---------------------------------------------------------------------------

/**
 * Seeds one release + its provider links + optional tracks into the database.
 * Skips if a release with the same slug already exists for this profile.
 */
async function seedRelease(
  db: ReturnType<typeof drizzle>,
  profileId: string,
  release: ScreenshotRelease
) {
  // Check if release already exists
  const [existing] = await db
    .select({ id: discogReleases.id })
    .from(discogReleases)
    .where(eq(discogReleases.slug, release.slug))
    .limit(1);

  if (existing) {
    console.log(`    ✓ Release exists: ${release.title}`);
    return existing.id;
  }

  // Create release
  const [created] = await db
    .insert(discogReleases)
    .values({
      creatorProfileId: profileId,
      title: release.title,
      slug: release.slug,
      releaseType: release.releaseType,
      releaseDate: release.releaseDate,
      artworkUrl: release.artworkUrl,
      label: release.label,
      upc: release.upc,
      totalTracks: release.totalTracks,
      spotifyPopularity: release.spotifyPopularity,
      sourceType: 'manual',
    })
    .returning({ id: discogReleases.id });

  const releaseId = created.id;
  console.log(
    `    ✓ Created release: ${release.title} (${release.releaseType})`
  );

  // Create provider links
  for (const [providerId, url] of Object.entries(release.providers)) {
    await db
      .insert(providerLinks)
      .values({
        providerId,
        ownerType: 'release',
        releaseId,
        url,
        isPrimary: providerId === 'spotify',
        sourceType: 'ingested',
      })
      .onConflictDoNothing();
  }
  console.log(
    `    ✓ Added ${Object.keys(release.providers).length} provider links`
  );

  // Create tracks if provided
  if (release.tracks) {
    for (const track of release.tracks) {
      const [createdTrack] = await db
        .insert(discogTracks)
        .values({
          releaseId,
          creatorProfileId: profileId,
          title: track.title,
          slug: track.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, ''),
          trackNumber: track.trackNumber,
          discNumber: 1,
          durationMs: track.durationMs,
          isrc: track.isrc,
          isExplicit: track.isExplicit,
          sourceType: 'manual',
        })
        .returning({ id: discogTracks.id });

      // Add track-level provider links
      for (const [providerId, url] of Object.entries(track.providers)) {
        await db
          .insert(providerLinks)
          .values({
            providerId,
            ownerType: 'track',
            trackId: createdTrack.id,
            url,
            isPrimary: providerId === 'spotify',
            sourceType: 'ingested',
          })
          .onConflictDoNothing();
      }
    }
    console.log(`    ✓ Added ${release.tracks.length} tracks`);
  }

  return releaseId;
}

/**
 * Main seed function. Updates the E2E test user's profile for marketing
 * screenshots and populates a rich set of releases.
 */
export async function seedScreenshotData() {
  console.log('📸 Seeding product screenshot data...\n');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('⚠ DATABASE_URL not set, skipping seed');
    return { success: false, reason: 'no_database_url' };
  }

  const sql = neon(databaseUrl);
  const db = drizzle(sql, { schema });

  const E2E_USERNAME = 'e2e-test-user';

  // Find the E2E test user's profile
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      displayName: creatorProfiles.displayName,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, E2E_USERNAME.toLowerCase()))
    .limit(1);

  if (!profile) {
    console.error(
      '❌ E2E test user profile not found. Run seed-test-data.ts first.'
    );
    return { success: false, reason: 'no_profile' };
  }

  console.log(`  Found profile: ${profile.displayName} (${profile.id})`);

  // Update profile for marketing-friendly display
  await db
    .update(creatorProfiles)
    .set({
      displayName: 'Aria Chen',
      bio: 'Electronic artist & producer. Blending ambient textures with driving rhythms.',
    })
    .where(eq(creatorProfiles.id, profile.id));
  console.log('  ✓ Updated profile display name to "Aria Chen"\n');

  // Seed all releases
  console.log('  Seeding releases...');
  for (const release of SCREENSHOT_RELEASES) {
    await seedRelease(db, profile.id, release);
    console.log('');
  }

  console.log('✅ Screenshot data seeding complete');
  console.log(`   ${SCREENSHOT_RELEASES.length} releases seeded`);
  console.log(
    `   ${SCREENSHOT_RELEASES.reduce((sum, r) => sum + (r.tracks?.length ?? 0), 0)} tracks seeded`
  );
  return { success: true };
}

// Allow running directly
if (require.main === module) {
  seedScreenshotData()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}
