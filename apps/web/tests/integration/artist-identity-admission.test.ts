import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SemanticContractError } from '@/lib/canonical/semantic-contract';
import type { DbOrTransaction } from '@/lib/db';
import { artists } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  findArtist,
  findOrCreateArtist,
} from '@/lib/discography/artist-queries/artist-crud';
import { setupDatabaseBeforeAll } from '../setup-db';

setupDatabaseBeforeAll();
let database: DbOrTransaction;
const artistIds = new Set<string>();
const profileIds = new Set<string>();
const spotifyId = () => randomUUID().replaceAll('-', '').slice(0, 22);

beforeAll(() => {
  if (!globalThis.db)
    throw new Error('Real database required for identity admission');
  database = globalThis.db;
});

afterEach(async () => {
  if (artistIds.size)
    await database.delete(artists).where(inArray(artists.id, [...artistIds]));
  if (profileIds.size)
    await database
      .delete(creatorProfiles)
      .where(inArray(creatorProfiles.id, [...profileIds]));
  artistIds.clear();
  profileIds.clear();
});

async function seedArtist(ids: { spotifyId: string; appleMusicId?: string }) {
  const id = randomUUID();
  artistIds.add(id);
  const [artist] = await database
    .insert(artists)
    .values({
      id,
      name: 'Same Name',
      nameNormalized: 'same name',
      ...ids,
    })
    .returning();
  return artist;
}

describe('canonical artist admission on real Postgres', () => {
  it('keeps same-name/no-MBID identities separate and deduplicates concurrent deliveries', async () => {
    const first = await seedArtist({ spotifyId: spotifyId() });
    const input = { name: 'Same Name', spotifyId: spotifyId() };
    const results = await Promise.all([
      findOrCreateArtist(input, database),
      findOrCreateArtist(input, database),
    ]);
    for (const result of results) artistIds.add(result.id);
    expect(results[0].id).toBe(results[1].id);
    expect(results[0].id).not.toBe(first.id);
    expect(results[0].musicbrainzId).toBeNull();
    expect(
      await database
        .select()
        .from(artists)
        .where(eq(artists.spotifyId, input.spotifyId))
    ).toHaveLength(1);
    const enrichment = { ...input, appleMusicId: randomUUID() };
    const duplicates = await Promise.all([
      findOrCreateArtist(enrichment, database),
      findOrCreateArtist(enrichment, database),
    ]);
    expect(duplicates.map(result => result.appleMusicId)).toEqual([
      enrichment.appleMusicId,
      enrichment.appleMusicId,
    ]);
  });

  it('quarantines cross-entity assertions and provider-ID reuse without modifying either entity', async () => {
    const first = await seedArtist({
      spotifyId: spotifyId(),
      appleMusicId: randomUUID(),
    });
    const second = await seedArtist({
      spotifyId: spotifyId(),
      appleMusicId: randomUUID(),
    });
    const before = await database
      .select()
      .from(artists)
      .where(inArray(artists.id, [first.id, second.id]))
      .orderBy(artists.id);
    for (const appleMusicId of [second.appleMusicId, randomUUID()]) {
      await expect(
        findOrCreateArtist(
          {
            name: 'Same Name',
            spotifyId: first.spotifyId,
            appleMusicId,
          },
          database
        )
      ).rejects.toBeInstanceOf(SemanticContractError);
    }
    expect(
      await database
        .select()
        .from(artists)
        .where(inArray(artists.id, [first.id, second.id]))
        .orderBy(artists.id)
    ).toEqual(before);
    await expect(
      findArtist({ name: 'Same Name' }, database)
    ).rejects.toBeInstanceOf(SemanticContractError);
  });

  it('fences competing provider corrections and leaves the winning mapping stable on replay', async () => {
    const artist = await seedArtist({ spotifyId: spotifyId() });
    const outcomes = await Promise.allSettled(
      [randomUUID(), randomUUID()].map(appleMusicId =>
        findOrCreateArtist(
          { name: 'Same Name', spotifyId: artist.spotifyId, appleMusicId },
          database
        )
      )
    );
    expect(
      outcomes.filter(result => result.status === 'fulfilled')
    ).toHaveLength(1);
    const rejected = outcomes.find(result => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(
      SemanticContractError
    );
    const winner = await findArtist({ spotifyId: artist.spotifyId }, database);
    expect(winner?.appleMusicId).toBeTruthy();
    const replay = await findOrCreateArtist(
      {
        name: 'Same Name',
        spotifyId: artist.spotifyId,
        appleMusicId: winner?.appleMusicId,
      },
      database
    );
    expect(replay).toEqual(winner);
    expect(replay.creatorProfileId).toBeNull();
  });

  it('cannot bind or move an artist between tenants through resolver input', async () => {
    const profiles = [randomUUID(), randomUUID()];
    for (const id of profiles) profileIds.add(id);
    await database.insert(creatorProfiles).values(
      profiles.map(id => ({
        id,
        creatorType: 'artist' as const,
        username: `admission-${id}`,
        usernameNormalized: `admission-${id}`,
        displayName: 'Admission Fixture',
      }))
    );
    const artist = await seedArtist({ spotifyId: spotifyId() });
    await database
      .update(artists)
      .set({ creatorProfileId: profiles[0] })
      .where(eq(artists.id, artist.id));
    for (const creatorProfileId of profiles) {
      await expect(
        findOrCreateArtist(
          {
            name: 'Same Name',
            spotifyId: artist.spotifyId,
            creatorProfileId,
          },
          database
        )
      ).rejects.toBeInstanceOf(SemanticContractError);
    }
    await expect(
      findOrCreateArtist(
        { name: 'Unbound Import', creatorProfileId: profiles[1] },
        database
      )
    ).rejects.toBeInstanceOf(SemanticContractError);
    expect(
      (await findArtist({ spotifyId: artist.spotifyId }, database))
        ?.creatorProfileId
    ).toBe(profiles[0]);
    expect(
      await database
        .select()
        .from(creatorProfiles)
        .where(inArray(creatorProfiles.id, profiles))
        .orderBy(creatorProfiles.id)
    ).toMatchObject(profiles.toSorted().map(id => ({ id, isClaimed: false })));
  });
});
