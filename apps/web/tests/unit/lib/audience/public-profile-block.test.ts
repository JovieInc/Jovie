import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFingerprintEdge: vi.fn(),
  select: vi.fn(),
  and: vi.fn(() => 'and-clause'),
  eq: vi.fn(() => 'eq-clause'),
  exists: vi.fn(() => 'exists-clause'),
  isNull: vi.fn(() => 'is-null-clause'),
  getRedis: vi.fn(),
  addBreadcrumb: vi.fn(),
  withTimeout: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db/query-timeout', () => ({
  withTimeout: mocks.withTimeout,
  QueryTimeoutError: class QueryTimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'QueryTimeoutError';
    }
  },
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: mocks.addBreadcrumb,
}));

vi.mock('@/lib/audience/fingerprint', () => ({
  createFingerprintEdge: mocks.createFingerprintEdge,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  eq: mocks.eq,
  exists: mocks.exists,
  isNull: mocks.isNull,
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  audienceBlocks: {
    id: 'audienceBlocks.id',
    creatorProfileId: 'audienceBlocks.creatorProfileId',
    fingerprint: 'audienceBlocks.fingerprint',
    unblockedAt: 'audienceBlocks.unblockedAt',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creatorProfiles.id',
    username: 'creatorProfiles.username',
  },
}));

vi.mock('@/lib/redis', () => ({
  getRedis: mocks.getRedis,
}));

import {
  checkProfileVisitorBlocked,
  getAudienceBlockIpFromHeaders,
  invalidateProfileAudienceBlockCache,
  markProfileHasAudienceBlocks,
  markProfileHasNoAudienceBlocks,
} from '@/lib/audience/public-profile-block';

function mockAudienceBlockRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin, where }));
  mocks.select.mockReturnValue({ from });

  return { from, innerJoin, where, limit };
}

function mockProfileHasBlocksRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mocks.select.mockReturnValueOnce({ from });

  return { from, where, limit };
}

describe('public profile audience block helper', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSmoke = process.env.PUBLIC_NOAUTH_SMOKE;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.getRedis.mockReturnValue(null);
    // Default: withTimeout passes the promise through unchanged so existing
    // tests continue to work without being aware of the timeout wrapper.
    mocks.withTimeout.mockImplementation(
      (promise: Promise<unknown>) => promise
    );
    // Reset select to a clean no-op so persistent mockImplementation from a
    // prior test (e.g. "fails open when the DB query throws") does not bleed
    // into subsequent tests.
    mocks.select.mockReset();
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSmoke === undefined) {
      delete process.env.PUBLIC_NOAUTH_SMOKE;
    } else {
      process.env.PUBLIC_NOAUTH_SMOKE = originalSmoke;
    }
    await invalidateProfileAudienceBlockCache('tim');
    await invalidateProfileAudienceBlockCache('timwhite');
  });

  it('extracts the client IP with the same priority as audience tracking', () => {
    expect(
      getAudienceBlockIpFromHeaders(
        new Headers({
          'cf-connecting-ip': '1.1.1.1',
          'x-real-ip': '2.2.2.2',
          'x-forwarded-for': '3.3.3.3, 4.4.4.4',
          'true-client-ip': '5.5.5.5',
        })
      )
    ).toBe('1.1.1.1');

    expect(
      getAudienceBlockIpFromHeaders(
        new Headers({
          'x-forwarded-for': '3.3.3.3, 4.4.4.4',
          'true-client-ip': '5.5.5.5',
        })
      )
    ).toBe('3.3.3.3');
  });

  it('skips DB work in test mode', async () => {
    process.env.NODE_ENV = 'test';

    await expect(
      checkProfileVisitorBlocked('tim', '1.2.3.4', 'Mozilla')
    ).resolves.toBe(false);

    expect(mocks.createFingerprintEdge).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('skips DB work in public no-auth smoke mode', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_NOAUTH_SMOKE = '1';

    await expect(
      checkProfileVisitorBlocked('tim', '1.2.3.4', 'Mozilla')
    ).resolves.toBe(false);

    expect(mocks.createFingerprintEdge).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('returns true when the joined block query finds a row', async () => {
    process.env.NODE_ENV = 'production';
    mocks.createFingerprintEdge.mockResolvedValue('fingerprint-1');
    mockProfileHasBlocksRows([{ profileId: 'profile-1' }]);
    mockAudienceBlockRows([{ blockId: 'block-1' }]);

    await expect(
      checkProfileVisitorBlocked('TimWhite', '1.2.3.4', 'Mozilla')
    ).resolves.toBe(true);

    expect(mocks.createFingerprintEdge).toHaveBeenCalledWith(
      '1.2.3.4',
      'Mozilla'
    );
    expect(mocks.eq).toHaveBeenCalledWith(
      'creatorProfiles.username',
      'timwhite'
    );
    expect(mocks.eq).toHaveBeenCalledWith(
      'audienceBlocks.fingerprint',
      'fingerprint-1'
    );
  });

  it('caches unknown or unblocked profiles and skips repeat DB work', async () => {
    process.env.NODE_ENV = 'production';
    mocks.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    }));

    await expect(
      checkProfileVisitorBlocked('tim', '1.2.3.4', 'Mozilla')
    ).resolves.toBe(false);
    const callsAfterFirst = mocks.select.mock.calls.length;
    await expect(
      checkProfileVisitorBlocked('tim', '1.2.3.4', 'Mozilla')
    ).resolves.toBe(false);

    expect(mocks.select.mock.calls.length).toBe(callsAfterFirst);
    expect(mocks.createFingerprintEdge).not.toHaveBeenCalled();
  });

  it('uses the has-blocks flag to skip the existence probe on repeat hits', async () => {
    process.env.NODE_ENV = 'production';
    mocks.createFingerprintEdge.mockResolvedValue('fingerprint-1');
    mockProfileHasBlocksRows([{ profileId: 'profile-1' }]);
    mockAudienceBlockRows([]);
    mockAudienceBlockRows([]);

    await expect(
      checkProfileVisitorBlocked('timwhite', '1.2.3.4', 'Mozilla')
    ).resolves.toBe(false);
    const callsAfterFirst = mocks.select.mock.calls.length;
    await expect(
      checkProfileVisitorBlocked('timwhite', '1.2.3.4', 'Mozilla')
    ).resolves.toBe(false);

    expect(mocks.select.mock.calls.length - callsAfterFirst).toBe(1);
    expect(mocks.createFingerprintEdge).toHaveBeenCalledTimes(2);
  });

  it('marks profiles with no active blocks as negative-cache safe', async () => {
    process.env.NODE_ENV = 'production';
    await markProfileHasNoAudienceBlocks('tim');

    await expect(
      checkProfileVisitorBlocked('tim', '1.2.3.4', 'Mozilla')
    ).resolves.toBe(false);

    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.createFingerprintEdge).not.toHaveBeenCalled();
  });

  it('invalidates negative cache when a profile gains active blocks', async () => {
    process.env.NODE_ENV = 'production';
    mocks.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    }));
    await checkProfileVisitorBlocked('tim', '1.2.3.4', 'Mozilla');

    mocks.createFingerprintEdge.mockResolvedValue('fingerprint-1');
    await markProfileHasAudienceBlocks('tim');
    mockAudienceBlockRows([{ blockId: 'block-1' }]);

    await expect(
      checkProfileVisitorBlocked('tim', '1.2.3.4', 'Mozilla')
    ).resolves.toBe(true);
  });

  it('fails open when the DB query throws', async () => {
    process.env.NODE_ENV = 'production';
    mocks.createFingerprintEdge.mockResolvedValue('fingerprint-1');
    mocks.select.mockImplementation(() => {
      throw new Error('db unavailable');
    });

    await expect(
      checkProfileVisitorBlocked('tim', '1.2.3.4', 'Mozilla')
    ).resolves.toBe(false);
  });

  it('fails open after DB query timeout', async () => {
    process.env.NODE_ENV = 'production';
    // profileHasActiveBlocks builds the query promise first (db.select chain),
    // then passes it to withTimeout. We need select to return a valid chain for
    // BOTH the outer select and the inner exists-subquery select so the
    // queryPromise is fully constructed. Only then does withTimeout get called.
    // withTimeout rejecting with QueryTimeoutError simulates a Neon cold-start
    // timeout. This also validates the `return await` fix: without it, the
    // rejected promise escapes the local try/catch in checkProfileVisitorBlocked
    // and the caller would see an unhandled rejection instead of `false`.
    const { QueryTimeoutError } = await import('@/lib/db/query-timeout');
    // Outer select chain (profileId row)
    mockProfileHasBlocksRows([]);
    // Inner exists-subquery select chain (audienceBlocks.id row) — needs to
    // produce a chainable object even though we never await its result.
    const innerLimit = vi.fn().mockResolvedValue([]);
    const innerWhere = vi.fn(() => ({ limit: innerLimit }));
    const innerFrom = vi.fn(() => ({ where: innerWhere }));
    mocks.select.mockReturnValueOnce({ from: innerFrom });

    mocks.withTimeout.mockRejectedValueOnce(
      new QueryTimeoutError(
        '[audience-block] profileHasActiveBlocks timed out after 3000ms'
      )
    );

    await expect(
      checkProfileVisitorBlocked('tim', '1.2.3.4', 'Mozilla')
    ).resolves.toBe(false);

    // withTimeout must have been reached — both select chains were constructed
    // and the timeout wrapper was invoked before the rejection.
    expect(mocks.withTimeout).toHaveBeenCalledTimes(1);
  });
});
