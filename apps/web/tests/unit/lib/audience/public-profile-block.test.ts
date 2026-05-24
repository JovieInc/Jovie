import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFingerprintEdge: vi.fn(),
  select: vi.fn(),
  and: vi.fn(() => 'and-clause'),
  eq: vi.fn(() => 'eq-clause'),
  isNull: vi.fn(() => 'is-null-clause'),
}));

vi.mock('server-only', () => ({}));

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

import {
  checkProfileVisitorBlocked,
  getAudienceBlockIpFromHeaders,
} from '@/lib/audience/public-profile-block';

function mockAudienceBlockRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  mocks.select.mockReturnValue({ from });

  return { from, innerJoin, where, limit };
}

describe('public profile audience block helper', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSmoke = process.env.PUBLIC_NOAUTH_SMOKE;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSmoke === undefined) {
      delete process.env.PUBLIC_NOAUTH_SMOKE;
    } else {
      process.env.PUBLIC_NOAUTH_SMOKE = originalSmoke;
    }
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
});
