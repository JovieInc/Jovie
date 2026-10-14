import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  bound: vi.fn(),
  process: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  predicates: [] as unknown[],
  recover: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.auth }));
vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: mocks.returning })),
      })),
    })),
  },
}));
vi.mock('@/lib/dsp-enrichment/catalog-scan-target', () => ({
  getBoundSpotifyArtistId: mocks.bound,
}));
vi.mock('@/lib/dsp-enrichment/jobs/catalog-scan', () => ({
  processCatalogScanStandalone: mocks.process,
  recoverStaleScan: mocks.recover,
}));

import { PATCH } from '@/app/api/dsp/catalog-scan/mismatches/[id]/route';
import { GET as results } from '@/app/api/dsp/catalog-scan/results/route';
import { POST } from '@/app/api/dsp/catalog-scan/route';
import { GET as status } from '@/app/api/dsp/catalog-scan/status/route';

const profileId = '00000000-0000-4000-8000-000000000001';
const scanId = '00000000-0000-4000-8000-000000000002';
const artistId = 'a'.repeat(22);
const userId = '00000000-0000-4000-8000-000000000003';
const query = (predicate: unknown) =>
  new PgDialect().sqlToQuery(predicate as never);
const request = (spotifyArtistId = artistId) =>
  new Request('http://localhost/api/dsp/catalog-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId, spotifyArtistId }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.predicates.length = 0;
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: mocks.limit,
    then: (resolve: never, reject: never) =>
      Promise.resolve(mocks.limit()).then(resolve, reject),
  };
  for (const method of [
    chain.from,
    chain.innerJoin,
    chain.where,
    chain.orderBy,
  ])
    method.mockReturnValue(chain);
  chain.where.mockImplementation(predicate => {
    mocks.predicates.push(predicate);
    return chain;
  });
  mocks.select.mockReturnValue(chain);
  mocks.auth.mockResolvedValue({ userId });
  mocks.bound.mockResolvedValue(artistId);
  mocks.limit
    .mockResolvedValueOnce([{ id: profileId }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id: scanId }]);
  mocks.process.mockResolvedValue(undefined);
  mocks.recover.mockResolvedValue(false);
});

describe('catalog scan identity admission', () => {
  it('does not read connections or dispatch scans for an unowned profile', async () => {
    mocks.limit.mockReset().mockResolvedValueOnce([]);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.bound).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it.each([null, 'b'.repeat(22)])(
    'rejects unconfirmed/conflicting target %s before creating a scan',
    async bound => {
      mocks.bound.mockResolvedValue(bound);
      expect((await POST(request())).status).toBe(403);
      expect(mocks.select).toHaveBeenCalledTimes(1);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.process).not.toHaveBeenCalled();
    }
  );

  it('rejects another requested artist even when the profile has a verified connection', async () => {
    expect((await POST(request('b'.repeat(22)))).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('dispatches only the verified target after ownership checks', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scanId, status: 'pending' });
    const checks = mocks.predicates.map(query);
    expect(checks[0].sql).toContain('"users"."id"');
    expect(checks[0].sql).not.toContain('clerk_id');
    expect(checks[0].params).toEqual([profileId, userId]);
    expect(checks[1].params).toContain(artistId);
    expect(checks[2].params).toContain(artistId);
    expect(mocks.process).toHaveBeenCalledWith({
      creatorProfileId: profileId,
      spotifyArtistId: artistId,
      scanId,
    });
  });
});

describe('catalog scan observation and owner readback', () => {
  const failed = {
    id: scanId,
    externalArtistId: artistId,
    status: 'failed',
    error: 'Availability remains unknown',
  };
  const requestResults = () =>
    new Request(
      `http://localhost/api/dsp/catalog-scan/results?profileId=${profileId}`
    );
  it.each(['failed', 'pending', 'running', 'completed'])(
    'returns the latest %s observation without filtering it away',
    async state => {
      mocks.limit
        .mockReset()
        .mockResolvedValueOnce([{ id: profileId }])
        .mockResolvedValueOnce([{ ...failed, status: state }])
        .mockResolvedValueOnce([
          { mismatch: { id: 'saved-dismissal', status: 'dismissed' } },
        ]);
      const response = await results(requestResults());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        scan: { status: state },
        mismatches: [{ id: 'saved-dismissal', status: 'dismissed' }],
      });
      const checks = mocks.predicates.map(query);
      expect(checks[0].params).toEqual([profileId, userId]);
      expect(checks[0].sql).not.toContain('clerk_id');
      expect(checks[1].params).toEqual([profileId, 'spotify']);
      expect(checks[1].sql).not.toContain('status');
      expect(checks[2].params).toEqual([profileId, 'spotify', artistId]);
    }
  );
  it.each([null, 'b'.repeat(22)])(
    'retains old target history as unverified for new binding %s',
    async bound => {
      mocks.bound.mockResolvedValue(bound);
      mocks.limit
        .mockReset()
        .mockResolvedValueOnce([{ id: profileId }])
        .mockResolvedValueOnce([{ ...failed, status: 'completed' }]);
      const json = await (await results(requestResults())).json();
      expect(json.scan.status).toBe('failed');
      expect(json.scan.error).toContain('historical');
      expect(json.mismatches).toEqual([]);
      expect(mocks.select).toHaveBeenCalledTimes(2);
    }
  );
  it('does not read observations for an unowned profile', async () => {
    mocks.limit.mockReset().mockResolvedValueOnce([]);
    expect((await results(requestResults())).status).toBe(403);
    expect(mocks.bound).not.toHaveBeenCalled();
  });
  it('uses app UUID ownership and exposes stale recovery on the same poll', async () => {
    mocks.limit
      .mockReset()
      .mockResolvedValueOnce([{ id: scanId, status: 'running' }]);
    mocks.recover.mockResolvedValue(true);
    const json = await (
      await status(
        new Request(
          `http://localhost/api/dsp/catalog-scan/status?scanId=${scanId}`
        )
      )
    ).json();
    expect(json.scan.status).toBe('failed');
    expect(query(mocks.predicates[0]).params).toEqual([scanId, userId]);
    expect(query(mocks.predicates[0]).sql).not.toContain('clerk_id');
  });
  it('admits mismatch triage using app UUID ownership', async () => {
    mocks.limit
      .mockReset()
      .mockResolvedValueOnce([{ id: 'mismatch', creatorProfileId: profileId }])
      .mockResolvedValueOnce([{ id: profileId }]);
    const response = await PATCH(
      new Request('http://localhost/api/dsp/catalog-scan/mismatches/mismatch', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' }),
      }),
      { params: Promise.resolve({ id: 'mismatch' }) }
    );
    expect(response.status).toBe(200);
    expect(query(mocks.predicates[1]).params).toEqual([profileId, userId]);
    expect(query(mocks.predicates[1]).sql).not.toContain('clerk_id');
  });
});
