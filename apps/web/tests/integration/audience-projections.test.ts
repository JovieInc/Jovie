import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbType } from '@/lib/db';
import { rebuildAudienceProjections } from '@/lib/db/rebuild-audience-projections';
import {
  audienceActions,
  audienceMembers,
  audienceProjectionSnapshots,
  audienceReferrers,
  audienceSourceLinks,
  clickEvents,
} from '@/lib/db/schema/analytics';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { setupDatabaseBeforeAll } from '../setup-db';

setupDatabaseBeforeAll();
let db: DbType;
let profiles: string[];
let members: string[];
const timestamp = '2020-11-01T01:30:00-04:00';
const legacy = {
  label: 'Played',
  timestamp,
  arbitrary: { retained: [null, 3] },
};
beforeAll(() => {
  if (!globalThis.db) throw new Error('Real database required');
  db = globalThis.db;
});
beforeEach(async () => {
  profiles = [randomUUID(), randomUUID()];
  members = [randomUUID(), randomUUID()];
  await db.insert(creatorProfiles).values(
    profiles.map(id => ({
      id,
      creatorType: 'artist' as const,
      username: `projection-${id}`,
      usernameNormalized: `projection-${id}`,
    }))
  );
  await db.insert(audienceMembers).values(
    members.map((id, i) => ({
      id,
      creatorProfileId: profiles[i],
      latestActions: [legacy],
      referrerHistory: [
        { url: 'https://initial.track', custom: { preserved: true } },
      ],
      tags: ['keep'],
      utmParams: { source: 'keep' },
      visits: 99,
      engagementScore: 88,
    }))
  );
  await db.insert(audienceActions).values({
    audienceMemberId: members[1],
    creatorProfileId: profiles[1],
    label: 'neighbor',
  });
  await db.insert(audienceProjectionSnapshots).values({
    audienceMemberId: members[1],
    original: {
      latestActions: null,
      referrerHistory: null,
      latestActionLabel: 'neighbor',
      latestReferrerUrl: null,
    },
  });
});
afterEach(async () => {
  await db.delete(creatorProfiles).where(inArray(creatorProfiles.id, profiles));
});
const rebuild = (apply: boolean, extra = {}) =>
  db.transaction(tx =>
    rebuildAudienceProjections(tx, { profileId: profiles[0], apply, ...extra })
  );
const read = async () =>
  (
    await db
      .select()
      .from(audienceMembers)
      .where(eq(audienceMembers.id, members[0]))
  )[0];

describe('historical audience projections (real PostgreSQL)', () => {
  it('reconciles dual writes, preserves provenance/relationships and restores losslessly before duplicate-free replay', async () => {
    const [source] = await db
      .insert(audienceSourceLinks)
      .values({
        creatorProfileId: profiles[0],
        code: randomUUID(),
        name: 'source',
        destinationUrl: 'https://example.test',
      })
      .returning();
    const [click] = await db
      .insert(clickEvents)
      .values({ creatorProfileId: profiles[0], linkType: 'listen' })
      .returning();
    const historical = {
      label: 'Imported relationship',
      sourceLinkId: source.id,
      clickEventId: click.id,
      timestamp: null,
      properties: { imported: [1, null] },
      context: { unknown: true },
      extra: ['preserved'],
    };
    await db
      .update(audienceMembers)
      .set({ latestActions: [legacy, historical] })
      .where(eq(audienceMembers.id, members[0]));
    const original = await read();
    const [action] = await db
      .insert(audienceActions)
      .values({
        audienceMemberId: members[0],
        creatorProfileId: profiles[0],
        label: 'Played',
        timestamp: new Date(timestamp),
        sourceLinkId: source.id,
        clickEventId: click.id,
        properties: { keep: [1, null] },
        context: { keep: 'context' },
      })
      .returning();
    const dry = await rebuild(false);
    expect(dry.reports[0]).toMatchObject({
      actions: { imported: 1, matched: 1 },
      referrers: { imported: 1 },
    });
    expect(await read()).toEqual(original);
    expect(
      await db
        .select()
        .from(audienceProjectionSnapshots)
        .where(eq(audienceProjectionSnapshots.audienceMemberId, members[0]))
    ).toEqual([]);
    const applied = await rebuild(true);
    expect(applied.reports).toEqual(
      dry.reports.map(row => ({ ...row, applied: true }))
    );
    const rebuilt = await read();
    expect(rebuilt.latestActions).toEqual([
      { ...legacy, eventId: action.id },
      { ...historical, eventId: expect.any(String) },
    ]);
    expect(rebuilt.latestActionLabel).toBe('Played');
    expect(rebuilt.latestReferrerUrl).toBe('https://initial.track');
    expect(rebuilt).toMatchObject({
      tags: ['keep'],
      utmParams: { source: 'keep' },
      visits: 99,
      engagementScore: 88,
      firstSeenAt: original.firstSeenAt,
      lastSeenAt: original.lastSeenAt,
    });
    const [persisted] = await db
      .select()
      .from(audienceActions)
      .where(eq(audienceActions.id, action.id));
    const imported = (
      await db
        .select()
        .from(audienceActions)
        .where(eq(audienceActions.audienceMemberId, members[0]))
    ).find(row => row.id !== action.id);
    expect(imported).toMatchObject({
      creatorProfileId: profiles[0],
      sourceLinkId: source.id,
      clickEventId: click.id,
      timestamp: null,
      legacyPayload: historical,
      properties: historical.properties,
      context: historical.context,
    });
    expect(persisted).toMatchObject({
      ...action,
      legacyKey: expect.any(String),
      legacyPayload: legacy,
    });
    const [referrer] = await db
      .select()
      .from(audienceReferrers)
      .where(eq(audienceReferrers.audienceMemberId, members[0]));
    expect(referrer.timestamp).toBeNull();
    expect(referrer.legacyPayload).toEqual(original.referrerHistory?.[0]);
    const [snapshot] = await db
      .select()
      .from(audienceProjectionSnapshots)
      .where(eq(audienceProjectionSnapshots.audienceMemberId, members[0]));
    // Restore proof is local: exact original arrays/scalars including NULLs.
    await db
      .update(audienceMembers)
      .set(snapshot.original)
      .where(eq(audienceMembers.id, members[0]));
    expect(await read()).toEqual(original);
    await rebuild(true);
    expect(await read()).toEqual(rebuilt);
    const replay = await rebuild(true);
    expect(replay.reports[0]).toMatchObject({
      actions: { before: 2, imported: 0, matched: 0 },
      referrers: { before: 1, imported: 0, matched: 0 },
    });
    expect(
      (
        await db
          .select()
          .from(audienceProjectionSnapshots)
          .where(eq(audienceProjectionSnapshots.audienceMemberId, members[0]))
      )[0]
    ).toEqual(snapshot);
    expect(
      (
        await db
          .select()
          .from(audienceMembers)
          .where(eq(audienceMembers.id, members[1]))
      )[0].latestActions
    ).toEqual([legacy]);
  });

  it('bounds, resumes and serializes concurrent rebuilds; retains overflow and later fallback history', async () => {
    const id = randomUUID();
    await db.insert(audienceMembers).values({
      id,
      creatorProfileId: profiles[0],
      latestActions: Array.from({ length: 8 }, (_, i) => ({
        action: `seed-${i}`,
        timestamp: `2020-01-0${i + 1}T00:00:00Z`,
        unknown: [i],
      })),
      referrerHistory: Array.from({ length: 5 }, (_, i) => ({
        url: `https://seed-${i}`,
        timestamp: `2020-01-0${i + 1}T00:00:00Z`,
      })),
    });
    const page = await rebuild(true, { limit: 1 });
    expect(page.scanned).toBe(1);
    const second = await rebuild(true, { limit: 1, cursor: page.nextCursor });
    expect(second.scanned).toBe(1);
    expect(await rebuild(true, { cursor: second.nextCursor })).toMatchObject({
      scanned: 0,
    });
    await Promise.all([rebuild(true), rebuild(true)]);
    expect(
      await db
        .select()
        .from(audienceActions)
        .where(eq(audienceActions.audienceMemberId, id))
    ).toHaveLength(8);
    expect(
      await db
        .select()
        .from(audienceReferrers)
        .where(eq(audienceReferrers.audienceMemberId, id))
    ).toHaveLength(5);
    const [row] = await db
      .select()
      .from(audienceMembers)
      .where(eq(audienceMembers.id, id));
    expect(row.latestActions).toHaveLength(5);
    expect(row.referrerHistory).toHaveLength(3);
    expect(row.latestActions?.[0]).toMatchObject({ action: 'seed-7' });
    expect(row.latestActionLabel).toBe('seed-7');
    expect(row.latestReferrerUrl).toBe('https://seed-4');
    await db
      .update(audienceMembers)
      .set({
        referrerHistory: [
          { url: 'https://fallback', timestamp: '2022-01-01T00:00:00Z' },
          ...(row.referrerHistory ?? []),
        ],
      })
      .where(eq(audienceMembers.id, id));
    await rebuild(true);
    expect(
      await db
        .select()
        .from(audienceReferrers)
        .where(eq(audienceReferrers.audienceMemberId, id))
    ).toHaveLength(6);
    expect(
      (
        await db
          .select()
          .from(audienceMembers)
          .where(eq(audienceMembers.id, id))
      )[0].latestReferrerUrl
    ).toBe('https://fallback');
  });

  it('retains scalar-only fallback, NULL snapshots and rejects invalid batch bounds', async () => {
    await db
      .update(audienceMembers)
      .set({
        latestActions: null,
        referrerHistory: null,
        latestActionLabel: 'historical summary',
        latestReferrerUrl: 'https://summary',
      })
      .where(eq(audienceMembers.id, members[0]));
    await rebuild(true);
    const row = await read();
    expect(row.latestActionLabel).toBe('historical summary');
    expect(row.latestReferrerUrl).toBe('https://summary');
    const [snapshot] = await db
      .select()
      .from(audienceProjectionSnapshots)
      .where(eq(audienceProjectionSnapshots.audienceMemberId, members[0]));
    expect(snapshot.original.latestActions).toBeNull();
    expect(snapshot.original.referrerHistory).toBeNull();
    await db
      .update(audienceMembers)
      .set(snapshot.original)
      .where(eq(audienceMembers.id, members[0]));
    expect((await read()).latestActions).toBeNull();
    for (const limit of [0, 101, 1.5])
      await expect(rebuild(false, { limit })).rejects.toThrow();
  });

  it('rolls back conversion on ambiguous times and cross-tenant historical relationships', async () => {
    const [source] = await db
      .insert(audienceSourceLinks)
      .values({
        creatorProfileId: profiles[1],
        code: randomUUID(),
        name: 'foreign',
        destinationUrl: 'https://example.test',
      })
      .returning();
    await db
      .update(audienceMembers)
      .set({ latestActions: [{ ...legacy, sourceLinkId: source.id }] })
      .where(eq(audienceMembers.id, members[0]));
    await expect(rebuild(true)).rejects.toThrow('relationship ownership');
    expect(
      await db
        .select()
        .from(audienceActions)
        .where(eq(audienceActions.audienceMemberId, members[0]))
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(audienceProjectionSnapshots)
        .where(eq(audienceProjectionSnapshots.audienceMemberId, members[0]))
    ).toEqual([]);
    await db
      .update(audienceMembers)
      .set({
        latestActions: [{ label: 'x', timestamp: '2020-11-01T01:30:00' }],
      })
      .where(eq(audienceMembers.id, members[0]));
    await expect(rebuild(true)).rejects.toThrow('JOV-3063');
    expect(
      await db
        .select()
        .from(audienceProjectionSnapshots)
        .where(eq(audienceProjectionSnapshots.audienceMemberId, members[0]))
    ).toEqual([]);
  });
});
