import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbType } from '@/lib/db';
import {
  backfillAudienceActionOwners,
  reconcileAudienceActionOwners,
} from '@/lib/db/audience-action-owners';
import { audienceActions, audienceMembers } from '@/lib/db/schema/analytics';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { setupDatabaseBeforeAll } from '../setup-db';

setupDatabaseBeforeAll();
let db: DbType;
let profileIds: string[] = [];
let memberIds: string[] = [];
beforeAll(() => {
  if (!globalThis.db) throw new Error('Real database required');
  db = globalThis.db;
});
beforeEach(async () => {
  profileIds = [randomUUID(), randomUUID()];
  memberIds = [randomUUID(), randomUUID()];
  await db.insert(creatorProfiles).values(
    profileIds.map(id => ({
      id,
      creatorType: 'artist' as const,
      username: `owner-${id}`,
      usernameNormalized: `owner-${id}`,
    }))
  );
  await db.insert(audienceMembers).values(
    memberIds.map((id, i) => ({
      id,
      creatorProfileId: profileIds[i],
    }))
  );
});
afterEach(async () => {
  await db
    .delete(creatorProfiles)
    .where(inArray(creatorProfiles.id, profileIds));
});

const mismatch = {
  cause: { code: '23503', constraint: 'audience_actions_member_profile_fk' },
};

describe('audience action ownership (real PostgreSQL)', () => {
  it('rejects cross-profile inserts, updates and parent reassignment; accepts neighboring valid/null owners', async () => {
    const [valid] = await db
      .insert(audienceActions)
      .values({
        audienceMemberId: memberIds[0],
        creatorProfileId: profileIds[0],
        label: 'valid',
      })
      .returning();
    await db
      .insert(audienceActions)
      .values({ audienceMemberId: memberIds[1], label: 'historical' });
    await expect(
      db.insert(audienceActions).values({
        audienceMemberId: memberIds[0],
        creatorProfileId: profileIds[1],
        label: 'invalid',
      })
    ).rejects.toMatchObject(mismatch);
    await expect(
      db
        .update(audienceActions)
        .set({ creatorProfileId: profileIds[1] })
        .where(eq(audienceActions.id, valid.id))
    ).rejects.toMatchObject(mismatch);
    await expect(
      db
        .update(audienceMembers)
        .set({ creatorProfileId: profileIds[1] })
        .where(eq(audienceMembers.id, memberIds[0]))
    ).rejects.toMatchObject(mismatch);
    await db
      .delete(audienceMembers)
      .where(eq(audienceMembers.id, memberIds[0]));
    expect(
      await db
        .select()
        .from(audienceActions)
        .where(eq(audienceActions.id, valid.id))
    ).toEqual([]);
  });

  it('bounds, resumes and replays a missing-owner backfill without changing provenance or a neighboring tenant', async () => {
    const [known, first, second, neighbor] = await db
      .insert(audienceActions)
      .values([
        {
          audienceMemberId: memberIds[0],
          creatorProfileId: profileIds[0],
          label: 'known',
        },
        {
          audienceMemberId: memberIds[0],
          label: 'legacy',
          timestamp: null,
          emoji: 'x',
          properties: { original: ['preserved'] },
          context: { source: 'historical' },
        },
        {
          audienceMemberId: memberIds[0],
          label: 'backdated',
          timestamp: new Date('2020-11-01T01:30:00-04:00'),
        },
        { audienceMemberId: memberIds[1], label: 'neighbor' },
      ])
      .returning();
    const options = { profileId: profileIds[0], limit: 1 };
    const batch = (apply: boolean, cursor: string | null = null) =>
      db.transaction(tx =>
        backfillAudienceActionOwners(tx, { ...options, apply, cursor })
      );
    expect(await batch(false)).toMatchObject({ scanned: 1, updated: 0 });
    expect(await reconcileAudienceActionOwners(db, profileIds[0])).toEqual({
      total: '3',
      missing: '2',
      mismatched: '0',
    });
    const page = await batch(true);
    expect(page).toMatchObject({ scanned: 1, updated: 1 });
    expect(await batch(true, page.nextCursor)).toMatchObject({
      scanned: 1,
      updated: 1,
    });
    expect(await batch(true)).toEqual({
      scanned: 0,
      updated: 0,
      nextCursor: null,
    });
    const rows = await db
      .select()
      .from(audienceActions)
      .where(
        inArray(audienceActions.id, [
          known.id,
          first.id,
          second.id,
          neighbor.id,
        ])
      );
    expect(rows).toHaveLength(4);
    for (const original of [known, first, second, neighbor]) {
      expect(rows.find(row => row.id === original.id)).toEqual({
        ...original,
        creatorProfileId: original.id === neighbor.id ? null : profileIds[0],
      });
    }
    expect(await reconcileAudienceActionOwners(db, profileIds[0])).toEqual({
      total: '3',
      missing: '0',
      mismatched: '0',
    });
    expect(await reconcileAudienceActionOwners(db, profileIds[1])).toEqual({
      total: '1',
      missing: '1',
      mismatched: '0',
    });
    await db.insert(audienceActions).values({
      audienceMemberId: memberIds[0],
      label: 'overlap',
    });
    const overlap = await Promise.all([batch(true), batch(true)]);
    expect(overlap.reduce((sum, row) => sum + row.updated, 0)).toBe(1);
  });
});
