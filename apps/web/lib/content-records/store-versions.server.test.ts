import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The live-content cache has no expiry, so only real store answers may be
 * cached. A failed table probe or query must fall back per request and let the
 * next read retry.
 */
const mocks = vi.hoisted(() => ({
  table: vi.fn(),
  rows: vi.fn(),
  captureWarning: vi.fn(),
  // Mirrors the Data Cache: a returned value is stored with no expiry, a
  // thrown error is not stored.
  store: new Map<string, unknown>(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: () => Promise<unknown>, keyParts: string[]) => async () => {
      const key = keyParts.join(':');
      if (!mocks.store.has(key)) mocks.store.set(key, await fn());
      return mocks.store.get(key);
    },
}));
vi.mock('@/lib/db', () => {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'innerJoin', 'where']) {
    builder[method] = () => builder;
  }
  builder.limit = () => mocks.rows();
  return { doesTableExist: mocks.table, db: { select: () => builder } };
});
vi.mock('@/lib/db/legacy-transaction', () => ({
  runAtomicDbOperation: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mocks.captureWarning,
}));

const { getLiveContent } = await import('./store-versions.server');
const { MARKETING_PAGE_KIND, DEFAULT_HOME_SPEC } = await import(
  './marketing-page'
);

function liveRow() {
  return {
    versionId: 'v5',
    version: 5,
    data: DEFAULT_HOME_SPEC,
    schemaVersion: MARKETING_PAGE_KIND.schemaVersion,
    publishedAt: new Date('2026-10-28T01:00:00Z'),
  };
}

beforeEach(() => {
  mocks.table.mockReset().mockResolvedValue(true);
  mocks.rows.mockReset().mockResolvedValue([liveRow()]);
  mocks.captureWarning.mockReset();
  mocks.store.clear();
});

describe('live content cache correctness', () => {
  it('does not cache the default when the table probe fails transiently', async () => {
    mocks.table.mockResolvedValueOnce(false);
    const first = await getLiveContent(MARKETING_PAGE_KIND, 'home');
    expect(first).toMatchObject({
      source: 'default',
      fallbackReason: 'unavailable',
    });
    expect(mocks.rows).not.toHaveBeenCalled();

    const second = await getLiveContent(MARKETING_PAGE_KIND, 'home');
    expect(second).toMatchObject({ source: 'live', versionId: 'v5' });
  });

  it('does not cache the default when the query fails', async () => {
    mocks.rows.mockRejectedValueOnce(new Error('db down'));
    const first = await getLiveContent(MARKETING_PAGE_KIND, 'home');
    expect(first).toMatchObject({
      source: 'default',
      fallbackReason: 'unavailable',
    });
    expect(mocks.captureWarning).toHaveBeenCalledTimes(1);

    const second = await getLiveContent(MARKETING_PAGE_KIND, 'home');
    expect(second).toMatchObject({ source: 'live', versionId: 'v5' });
  });

  it('caches real answers, including "nothing published"', async () => {
    mocks.rows.mockResolvedValue([]);
    for (let read = 0; read < 2; read++) {
      expect(await getLiveContent(MARKETING_PAGE_KIND, 'home')).toMatchObject({
        source: 'default',
        fallbackReason: 'unpublished',
      });
    }
    expect(mocks.rows).toHaveBeenCalledTimes(1);
  });
});
