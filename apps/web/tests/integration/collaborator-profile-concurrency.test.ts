import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
/* eslint-disable no-restricted-imports -- Integration test requires the real schema and database */
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '@/lib/db/schema';
import {
  artists,
  discogReleases,
  providerLinks,
  releaseArtists,
} from '@/lib/db/schema/content';
import { libraryAssetApprovalStatuses } from '@/lib/db/schema/library';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { buildUnclaimedArtistHandle } from '@/lib/discography/artist-profile-routing';
import { setupDatabaseBeforeAll } from '../setup-db';

vi.mock('@/lib/spotify', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/spotify')>();
  return {
    ...actual,
    getSpotifyArtistsBatch: vi.fn(async (ids: readonly string[]) =>
      ids.map(id => ({
        id,
        name: `Collaborator ${id}`,
        images: [],
        genres: [],
      }))
    ),
  };
});

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn().mockResolvedValue(undefined),
}));

import { reconcileCreditedArtistProfiles } from '@/lib/discography/collaborator-profile-reconciliation';

type TestDb = NeonDatabase<typeof schema>;

setupDatabaseBeforeAll();

let db: TestDb;
const profileIds = new Set<string>();
const generatedSpotifyIds = new Set<string>();
const artistIds = new Set<string>();
const releaseIds = new Set<string>();

beforeAll(() => {
  const connection = (globalThis as typeof globalThis & { db?: TestDb }).db;
  if (!connection) {
    throw new Error(
      'Database connection not initialized for collaborator concurrency tests'
    );
  }
  db = connection;
});

afterEach(async () => {
  if (generatedSpotifyIds.size > 0) {
    const generatedProfiles = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(inArray(creatorProfiles.spotifyId, [...generatedSpotifyIds]));
    for (const profile of generatedProfiles) profileIds.add(profile.id);
  }

  if (releaseIds.size > 0) {
    await db
      .delete(discogReleases)
      .where(inArray(discogReleases.id, [...releaseIds]));
  }

  if (artistIds.size > 0) {
    await db
      .update(artists)
      .set({ creatorProfileId: null })
      .where(inArray(artists.id, [...artistIds]));
  }

  if (profileIds.size > 0) {
    await db
      .delete(socialLinks)
      .where(inArray(socialLinks.creatorProfileId, [...profileIds]));
    await db
      .delete(creatorProfiles)
      .where(inArray(creatorProfiles.id, [...profileIds]));
  }

  if (artistIds.size > 0) {
    await db.delete(artists).where(inArray(artists.id, [...artistIds]));
  }

  profileIds.clear();
  generatedSpotifyIds.clear();
  artistIds.clear();
  releaseIds.clear();
});

describe('collaborator profile reconciliation concurrency (integration)', () => {
  it('creates one profile and one binding across concurrent exact-ID runs', async () => {
    const suffix = randomUUID();
    const ownerProfileId = randomUUID();
    const ownerArtistId = randomUUID();
    const collaboratorArtistId = randomUUID();
    const releaseId = randomUUID();
    const ownerSpotifyId = `owner${suffix.replaceAll('-', '').slice(0, 17)}`;
    const collaboratorSpotifyId = `collab${suffix.replaceAll('-', '').slice(0, 16)}`;
    const collaboratorHandle = buildUnclaimedArtistHandle(collaboratorArtistId);

    profileIds.add(ownerProfileId);
    generatedSpotifyIds.add(collaboratorSpotifyId);
    artistIds.add(ownerArtistId);
    artistIds.add(collaboratorArtistId);
    releaseIds.add(releaseId);

    await db.insert(creatorProfiles).values({
      id: ownerProfileId,
      creatorType: 'creator',
      username: `owner-${suffix}`,
      usernameNormalized: `owner-${suffix}`,
      displayName: 'Concurrency Owner',
      isPublic: true,
      isClaimed: true,
    });
    await db.insert(artists).values([
      {
        id: ownerArtistId,
        name: 'Concurrency Owner',
        nameNormalized: `concurrency-owner-${suffix}`,
        spotifyId: ownerSpotifyId,
        isAutoCreated: true,
      },
      {
        id: collaboratorArtistId,
        name: 'Concurrency Collaborator',
        nameNormalized: `concurrency-collaborator-${suffix}`,
        spotifyId: collaboratorSpotifyId,
        isAutoCreated: true,
      },
    ]);
    await db.insert(discogReleases).values({
      id: releaseId,
      creatorProfileId: ownerProfileId,
      title: 'Concurrency Release',
      slug: `concurrency-release-${suffix}`,
      releaseDate: new Date('2026-01-01T00:00:00.000Z'),
      artworkUrl: 'https://example.com/concurrency-release.jpg',
      status: 'released',
      sourceType: 'ingested',
    });
    await db.insert(providerLinks).values({
      providerId: 'spotify',
      ownerType: 'release',
      releaseId,
      url: `https://open.spotify.com/album/${suffix.replaceAll('-', '')}`,
      sourceType: 'ingested',
    });
    await db.insert(libraryAssetApprovalStatuses).values({
      creatorProfileId: ownerProfileId,
      assetId: releaseId,
      itemKind: 'release',
      approvalStatus: 'approved',
      profileVisibility: 'visible',
    });
    await db.insert(releaseArtists).values([
      {
        releaseId,
        artistId: ownerArtistId,
        role: 'main_artist',
        position: 0,
        isPrimary: true,
      },
      {
        releaseId,
        artistId: collaboratorArtistId,
        role: 'featured_artist',
        position: 1,
      },
    ]);

    const results = await Promise.all([
      reconcileCreditedArtistProfiles(ownerProfileId, ownerSpotifyId),
      reconcileCreditedArtistProfiles(ownerProfileId, ownerSpotifyId),
    ]);

    const generatedProfiles = await db
      .select({
        id: creatorProfiles.id,
        spotifyId: creatorProfiles.spotifyId,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.spotifyId, collaboratorSpotifyId));
    for (const profile of generatedProfiles) profileIds.add(profile.id);

    const [boundCollaborator] = await db
      .select({ creatorProfileId: artists.creatorProfileId })
      .from(artists)
      .where(eq(artists.id, collaboratorArtistId));
    const ownerProfiles = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.spotifyId, ownerSpotifyId));

    expect(results.reduce((total, result) => total + result.created, 0)).toBe(
      1
    );
    expect(generatedProfiles).toEqual([
      expect.objectContaining({
        spotifyId: collaboratorSpotifyId,
        usernameNormalized: collaboratorHandle,
      }),
    ]);
    expect(boundCollaborator?.creatorProfileId).toBe(generatedProfiles[0]?.id);
    expect(ownerProfiles).toHaveLength(0);
  }, 30_000);
});
