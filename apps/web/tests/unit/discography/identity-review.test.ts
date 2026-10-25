import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const execute = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ db: { execute } }));

import {
  getDecidedKeys,
  getIdentityDecisionRates,
  loadPendingIdentityReviews,
  recordIdentityDecision,
} from '@/lib/discography/identity-review';

const OWNER = 'tim-id';
const dialect = new PgDialect();
const sqlText = (q: unknown) => dialect.sqlToQuery(q as never);

const release = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: 'Seaside Heights',
  release_date: '2020-05-14T00:00:00Z',
  source_type: 'ingested',
  approval: 'needs_review',
  metadata: {
    spotifyId: `sp-${id}`,
    spotifyArtists: [{ id: 'someone', name: 'Someone' }],
  },
  ...over,
});

describe('loadPendingIdentityReviews', () => {
  beforeEach(() => execute.mockReset());

  it('returns unsure releases with provenance and skips ones already answered', async () => {
    execute
      .mockResolvedValueOnce({ rows: [release('a'), release('b')] }) // releases
      .mockResolvedValueOnce({ rows: [{ provider_album_id: 'sp-b' }] }); // decided
    const pending = await loadPendingIdentityReviews('p1', OWNER);
    expect([...pending.keys()]).toEqual(['a']);
    expect(pending.get('a')?.reason).toBe('owner_not_credited');
    expect(pending.get('a')?.provenance).toContain('Found on Spotify');
  });

  it('never prompts for approved, hidden or non-ingested releases', async () => {
    execute
      .mockResolvedValueOnce({
        rows: [
          release('approved', { approval: 'approved' }),
          release('hidden', { approval: 'archived' }),
          release('manual', { source_type: 'manual' }),
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    expect((await loadPendingIdentityReviews('p1', OWNER)).size).toBe(0);
  });
});

describe('recordIdentityDecision', () => {
  beforeEach(() => execute.mockReset());

  it('Accept records the decision and publishes (approved)', async () => {
    execute
      .mockResolvedValueOnce({ rows: [release('a')] })
      .mockResolvedValue({ rows: [] });
    const result = await recordIdentityDecision({
      creatorProfileId: 'p1',
      releaseId: 'a',
      decision: 'accepted',
      decidedBy: 'u1',
      ownerSpotifyId: OWNER,
    });
    expect(result).toEqual({ ok: true });
    const decision = sqlText(execute.mock.calls[1]?.[0]);
    expect(decision.sql).toContain('release_identity_decisions');
    expect(decision.params).toEqual(
      expect.arrayContaining(['p1', 'sp-a', 'accepted', 'owner_not_credited'])
    );
    expect(sqlText(execute.mock.calls[2]?.[0]).params).toContain('approved');
  });

  it('Reject records the decision and hides (archived), keyed by provider album id', async () => {
    execute
      .mockResolvedValueOnce({ rows: [release('a')] })
      .mockResolvedValue({ rows: [] });
    await recordIdentityDecision({
      creatorProfileId: 'p1',
      releaseId: 'a',
      decision: 'rejected',
      decidedBy: 'u1',
      ownerSpotifyId: OWNER,
    });
    expect(sqlText(execute.mock.calls[1]?.[0]).params).toEqual(
      expect.arrayContaining(['sp-a', 'rejected'])
    );
    expect(sqlText(execute.mock.calls[2]?.[0]).params).toContain('archived');
  });

  it("refuses a release that is not the profile's own", async () => {
    execute.mockResolvedValueOnce({ rows: [release('a')] });
    expect(
      await recordIdentityDecision({
        creatorProfileId: 'p1',
        releaseId: 'someone-elses',
        decision: 'accepted',
        decidedBy: 'u1',
        ownerSpotifyId: OWNER,
      })
    ).toEqual({ ok: false });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe('decision queries', () => {
  beforeEach(() => execute.mockReset());

  it('getDecidedKeys filters by decision when asked', async () => {
    execute.mockResolvedValueOnce({ rows: [{ provider_album_id: 'x' }] });
    expect([...(await getDecidedKeys('p1', 'rejected'))]).toEqual(['x']);
    expect(sqlText(execute.mock.calls[0]?.[0]).params).toContain('rejected');
  });

  it('getIdentityDecisionRates returns accept/reject counts per reason', async () => {
    execute.mockResolvedValueOnce({
      rows: [{ reason: 'owner_not_credited', accepted: 3, rejected: 9 }],
    });
    expect(await getIdentityDecisionRates()).toEqual([
      { reason: 'owner_not_credited', accepted: 3, rejected: 9 },
    ]);
  });
});
