import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { setupDatabaseBeforeAll } from '../setup-db';

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: session.userId }),
}));

import { getArtistProfileSnapshot } from '@/lib/connectors/artist-profile-snapshot.server';

setupDatabaseBeforeAll();
let database: DbOrTransaction;
const profileIds: string[] = [];
const userIds: string[] = [];

beforeAll(() => {
  if (!globalThis.db)
    throw new Error('Real database required for canonical snapshots');
  database = globalThis.db;
});

afterEach(async () => {
  session.userId = null;
  if (profileIds.length)
    await database
      .delete(creatorProfiles)
      .where(inArray(creatorProfiles.id, profileIds));
  if (userIds.length)
    await database.delete(users).where(inArray(users.id, userIds));
  profileIds.length = 0;
  userIds.length = 0;
});

async function seedUser() {
  const id = randomUUID();
  userIds.push(id);
  await database.insert(users).values({ id, userStatus: 'active' });
  return id;
}

async function seedProfile(ownerId: string) {
  const id = randomUUID();
  profileIds.push(id);
  const username = `snapshot-${id}`;
  await database.insert(creatorProfiles).values({
    id,
    userId: ownerId,
    creatorType: 'artist',
    username,
    usernameNormalized: username,
    profileEditVersion: 7,
    bio: 'Canonical bio',
    avatarUrl: 'https://images.example.com/canonical.jpg',
    isPublic: true,
  });
  return { id, username };
}

async function seedWebsite(profileId: string) {
  const id = randomUUID();
  await database.insert(socialLinks).values({
    id,
    creatorProfileId: profileId,
    platform: 'website',
    platformType: 'website',
    url: `https://artist.example.com/${id}`,
    sortOrder: 200,
    version: 3,
  });
  return id;
}

describe('canonical artist-profile snapshots on real Postgres', () => {
  it('reads only the exact profile and persisted sources, with stable revision/provenance', async () => {
    const owner = await seedUser();
    const target = await seedProfile(owner);
    const other = await seedProfile(owner);
    const linkId = await seedWebsite(target.id);
    await seedWebsite(other.id);
    session.userId = owner;

    const first = await getArtistProfileSnapshot(target.id);
    expect(first.fields.bio.value).toBe('Canonical bio');
    expect(first.fields.image.value).toBe(
      'https://images.example.com/canonical.jpg'
    );
    expect(first.fields.bio_link.value).toBe(
      `https://jov.ie/${target.username}`
    );
    expect(first.fields.website.provenance).toEqual({
      source: 'social_links',
      profileId: target.id,
      links: [{ id: linkId, version: 3 }],
    });
    expect(await getArtistProfileSnapshot(target.id)).toEqual(first);
    expect((await getArtistProfileSnapshot(other.id)).revision).not.toBe(
      first.revision
    );
  });

  it('invalidates an old revision after persisted link and profile edits', async () => {
    session.userId = await seedUser();
    const target = await seedProfile(session.userId);
    const linkId = await seedWebsite(target.id);
    const first = await getArtistProfileSnapshot(target.id);
    await database
      .update(socialLinks)
      .set({ url: 'https://updated.example.com', version: 4 })
      .where(eq(socialLinks.id, linkId));
    await expect(
      getArtistProfileSnapshot(target.id, { expectedRevision: first.revision })
    ).rejects.toMatchObject({ reason: 'stale_revision' });
    const second = await getArtistProfileSnapshot(target.id);
    expect(second.fields.website.value).toBe('https://updated.example.com');
    expect(second.profileEditVersion).toBe(first.profileEditVersion);
    await database
      .update(creatorProfiles)
      .set({ bio: 'Edited canonical bio', profileEditVersion: 8 })
      .where(eq(creatorProfiles.id, target.id));
    await expect(
      getArtistProfileSnapshot(target.id, { expectedRevision: second.revision })
    ).rejects.toMatchObject({ reason: 'stale_revision' });
    expect((await getArtistProfileSnapshot(target.id)).fields.bio.value).toBe(
      'Edited canonical bio'
    );
  });

  it('keeps empty fields unavailable and refuses to choose among multiple websites', async () => {
    session.userId = await seedUser();
    const target = await seedProfile(session.userId);
    await database
      .update(creatorProfiles)
      .set({ bio: ' ', avatarUrl: null, username: '', usernameNormalized: '' })
      .where(eq(creatorProfiles.id, target.id));
    const empty = await getArtistProfileSnapshot(target.id);
    for (const field of Object.values(empty.fields))
      expect(field).toMatchObject({
        status: 'unavailable',
        value: null,
        reason: 'missing',
      });
    const firstId = await seedWebsite(target.id);
    const secondId = await seedWebsite(target.id);
    const ambiguous = await getArtistProfileSnapshot(target.id);
    expect(ambiguous.fields.website).toMatchObject({
      status: 'unavailable',
      value: null,
      reason: 'ambiguous',
    });
    expect(ambiguous.fields.website.provenance).toMatchObject({
      links: expect.arrayContaining([
        { id: firstId, version: 3 },
        { id: secondId, version: 3 },
      ]),
    });
    await database
      .update(socialLinks)
      .set({ state: 'rejected', version: 4 })
      .where(eq(socialLinks.id, secondId));
    const resolved = await getArtistProfileSnapshot(target.id);
    expect(resolved.fields.website.status).toBe('available');
    expect(resolved.revision).not.toBe(ambiguous.revision);
  });

  it('does not hide website ambiguity behind the social-link display limit', async () => {
    session.userId = await seedUser();
    const target = await seedProfile(session.userId);
    await database.insert(socialLinks).values(
      Array.from({ length: 101 }, (_, index) => ({
        creatorProfileId: target.id,
        platform: 'instagram',
        platformType: 'social',
        url: `https://instagram.com/snapshot${index}`,
        sortOrder: index,
      }))
    );
    await seedWebsite(target.id);
    await seedWebsite(target.id);
    expect(
      (await getArtistProfileSnapshot(target.id)).fields.website
    ).toMatchObject({ value: null, reason: 'ambiguous' });
  });

  it('requires an authenticated exact owner or manager and rejects viewers and stale legacy owners', async () => {
    const legacyOwner = await seedUser();
    const owner = await seedUser();
    const manager = await seedUser();
    const viewer = await seedUser();
    const target = await seedProfile(legacyOwner);
    await expect(getArtistProfileSnapshot(target.id)).rejects.toThrow(
      'Unauthorized'
    );
    session.userId = owner;
    await expect(getArtistProfileSnapshot(target.id)).rejects.toMatchObject({
      reason: 'forbidden',
    });
    await database.insert(userProfileClaims).values([
      { userId: owner, creatorProfileId: target.id, role: 'owner' },
      { userId: manager, creatorProfileId: target.id, role: 'manager' },
      { userId: viewer, creatorProfileId: target.id, role: 'viewer' },
    ]);
    for (const actor of [owner, manager]) {
      session.userId = actor;
      await expect(getArtistProfileSnapshot(target.id)).resolves.toMatchObject({
        profileId: target.id,
      });
    }
    for (const actor of [legacyOwner, viewer, await seedUser()]) {
      session.userId = actor;
      await expect(getArtistProfileSnapshot(target.id)).rejects.toMatchObject({
        reason: 'forbidden',
      });
    }
  });
});
