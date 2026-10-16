import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import { rebuildAudienceProjections } from './rebuild-audience-projections';
import {
  audienceActions,
  audienceMembers,
  audienceProjectionSnapshots,
  audienceReferrers,
} from './schema/analytics';

const profileId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';
const relatedId = '33333333-3333-4333-8333-333333333333';
function fixture() {
  const member = {
    id: memberId,
    creatorProfileId: profileId,
    latestActions: [
      {
        label: 'legacy',
        timestamp: null,
        sourceLinkId: relatedId,
        clickEventId: relatedId,
        properties: { preserved: [1] },
        context: { original: true },
        unknown: 'kept',
      },
    ],
    referrerHistory: [{ url: 'https://initial.track', timestamp: null }],
    latestActionLabel: null,
    latestReferrerUrl: null,
  };
  const rows = new Map<unknown, unknown[]>([[audienceMembers, [member]]]);
  const select = vi.fn(() => {
    const builder = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      for: vi.fn(),
      then: vi.fn(),
    };
    for (const method of [
      builder.where,
      builder.orderBy,
      builder.limit,
      builder.for,
    ])
      method.mockReturnValue(builder);
    builder.from.mockImplementation(table => {
      builder.then.mockImplementation(resolve =>
        Promise.resolve(rows.get(table) ?? []).then(resolve)
      );
      return builder;
    });
    return builder;
  });
  const inserted = new Map<unknown, unknown>();
  const insert = vi.fn(table => ({
    values: vi.fn(value => {
      inserted.set(table, value);
      return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) };
    }),
  }));
  const set = vi
    .fn()
    .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const execute = vi.fn().mockResolvedValue({ rows: [{ invalid: '0' }] });
  const tx = {
    select,
    insert,
    execute,
    update: vi.fn().mockReturnValue({ set }),
  };
  return {
    member,
    rows,
    inserted,
    tx,
    set,
    run: (apply: boolean) =>
      rebuildAudienceProjections(tx as unknown as DbOrTransaction, {
        profileId,
        apply,
      }),
  };
}

describe('audience rebuild transaction contract', () => {
  it.each([0, 101, 1.5])(
    'rejects unsafe bounds %s before acquiring locks',
    async limit => {
      const { tx } = fixture();
      await expect(
        rebuildAudienceProjections(tx as unknown as DbOrTransaction, {
          profileId,
          limit,
        })
      ).rejects.toThrow();
      expect(tx.select).not.toHaveBeenCalled();
      expect(tx.execute).not.toHaveBeenCalled();
    }
  );

  it('dry-runs and applies the same lossless plan through the approved transaction', async () => {
    const f = fixture();
    expect((await f.run(false)).reports[0]).toMatchObject({
      actions: { imported: 1 },
      referrers: { imported: 1 },
    });
    expect(f.tx.insert).not.toHaveBeenCalled();
    expect(f.tx.update).not.toHaveBeenCalled();
    await f.run(true);
    expect(f.inserted.get(audienceProjectionSnapshots)).toMatchObject({
      audienceMemberId: memberId,
      original: { latestActions: f.member.latestActions },
    });
    expect(f.inserted.get(audienceActions)).toEqual([
      expect.objectContaining({
        creatorProfileId: profileId,
        audienceMemberId: memberId,
        sourceLinkId: relatedId,
        clickEventId: relatedId,
        timestamp: null,
        legacyPayload: f.member.latestActions[0],
        properties: { preserved: [1] },
        context: { original: true },
      }),
    ]);
    expect(f.inserted.get(audienceReferrers)).toEqual([
      expect.objectContaining({
        url: 'https://initial.track',
        timestamp: null,
      }),
    ]);
    expect(f.set).toHaveBeenCalledWith(
      expect.objectContaining({
        latestActionLabel: 'legacy',
        latestReferrerUrl: 'https://initial.track',
      })
    );
    expect(f.tx.execute).toHaveBeenCalledWith("SET LOCAL lock_timeout = '5s'");
    expect(f.tx.execute).toHaveBeenCalledWith(
      "SET LOCAL statement_timeout = '30s'"
    );
  });

  it('reconciles existing events without reinsertion and uses retained history when current arrays are empty', async () => {
    const f = fixture();
    const payload = { label: 'legacy', timestamp: null };
    f.rows.set(audienceProjectionSnapshots, [
      {
        original: {
          latestActions: [payload],
          referrerHistory: f.member.referrerHistory,
        },
      },
    ]);
    f.rows.set(audienceMembers, [
      { ...f.member, latestActions: [], referrerHistory: [] },
    ]);
    f.rows.set(audienceActions, [
      {
        id: relatedId,
        audienceMemberId: memberId,
        creatorProfileId: profileId,
        label: 'legacy',
        timestamp: null,
        legacyKey: null,
        legacyPayload: null,
      },
    ]);
    f.rows.set(audienceReferrers, [
      {
        id: relatedId,
        url: 'https://initial.track',
        timestamp: null,
        legacyKey: null,
        legacyPayload: null,
      },
    ]);
    const result = await f.run(true);
    expect(result.reports[0]).toMatchObject({
      actions: { imported: 0, matched: 1 },
      referrers: { imported: 0, matched: 1 },
    });
    expect(f.inserted.has(audienceActions)).toBe(false);
    expect(f.inserted.has(audienceReferrers)).toBe(false);
    expect(f.set.mock.calls[0][0].latestActions[0]).toEqual({
      ...payload,
      eventId: relatedId,
    });
    expect(f.tx.execute).toHaveBeenCalledTimes(4);
  });

  it('fails before writes on ownership, event-budget or relationship discrepancies', async () => {
    const f = fixture();
    f.rows.set(audienceActions, [{ creatorProfileId: relatedId }]);
    await expect(f.run(true)).rejects.toThrow('ownership mismatch');
    f.rows.set(
      audienceActions,
      Array.from({ length: 10001 }, () => ({}))
    );
    await expect(f.run(true)).rejects.toThrow('event budget');
    f.rows.set(audienceActions, []);
    f.tx.execute.mockResolvedValue({ rows: [{ invalid: '1' }] });
    await expect(f.run(true)).rejects.toThrow('relationship ownership');
    expect(f.tx.insert).not.toHaveBeenCalled();
    expect(f.tx.update).not.toHaveBeenCalled();
  });
});
