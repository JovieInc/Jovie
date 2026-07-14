/**
 * Regression tests: profile claim tokens must stop resolving once
 * claimTokenExpiresAt has passed.
 *
 * generateClaimTokenPair() stamps a 30-day expiry, but until this guard the
 * WHERE clauses in isClaimTokenValid/lookupUsernameByClaimToken never read
 * claimTokenExpiresAt — a leaked claim link from an old cold email could take
 * ownership of an unclaimed profile indefinitely. These tests pin the expiry
 * guard at the query level (NULL-tolerant for legacy invites issued before
 * expiry stamping).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  })),
}));

vi.mock('@/lib/discography/queries', () => ({
  getLatestReleaseByUsername: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Partial mock: keep drizzle-orm real (schema tables need it) but turn the
// condition builders into inspectable descriptors so the WHERE tree can be
// asserted structurally.
vi.mock('drizzle-orm', async importOriginal => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    and: (...args: unknown[]) => ({ _type: 'and', args }),
    or: (...args: unknown[]) => ({ _type: 'or', args }),
    eq: (a: unknown, b: unknown) => ({ _type: 'eq', a, b }),
    gt: (a: unknown, b: unknown) => ({ _type: 'gt', a, b }),
    isNull: (a: unknown) => ({ _type: 'isNull', a }),
  };
});

import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  isClaimTokenValid,
  lookupUsernameByClaimToken,
} from '@/lib/services/profile/queries';

const NOW = new Date('2026-07-09T12:00:00.000Z');

interface ConditionNode {
  _type: string;
  args?: ConditionNode[];
  a?: unknown;
  b?: unknown;
}

function createSelectChain(result: unknown[] = []) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

/** The expiry guard both claim lookups must carry. */
const EXPECTED_EXPIRY_GUARD: ConditionNode = {
  _type: 'or',
  args: [
    { _type: 'isNull', a: creatorProfiles.claimTokenExpiresAt },
    { _type: 'gt', a: creatorProfiles.claimTokenExpiresAt, b: NOW },
  ],
};

describe('claim token expiry enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('isClaimTokenValid includes the expiry guard in its WHERE clause', async () => {
    const chain = createSelectChain([{ id: 'profile-1' }]);

    await expect(isClaimTokenValid('testartist', 'token-123')).resolves.toBe(
      true
    );

    const [condition] = chain.where.mock.calls[0] as [ConditionNode];
    expect(condition._type).toBe('and');
    expect(condition.args).toContainEqual(EXPECTED_EXPIRY_GUARD);
    // The pre-existing guards must survive alongside the expiry guard.
    expect(condition.args).toContainEqual({
      _type: 'eq',
      a: creatorProfiles.isClaimed,
      b: false,
    });
    expect(condition.args).toContainEqual({
      _type: 'eq',
      a: creatorProfiles.isPublic,
      b: true,
    });
  });

  it('lookupUsernameByClaimToken includes the expiry guard in its WHERE clause', async () => {
    const chain = createSelectChain([{ username: 'testartist' }]);

    await expect(lookupUsernameByClaimToken('token-123')).resolves.toBe(
      'testartist'
    );

    const [condition] = chain.where.mock.calls[0] as [ConditionNode];
    expect(condition._type).toBe('and');
    expect(condition.args).toContainEqual(EXPECTED_EXPIRY_GUARD);
    expect(condition.args).toContainEqual({
      _type: 'eq',
      a: creatorProfiles.isClaimed,
      b: false,
    });
  });

  it('returns false / null when no row matches (expired token filtered by the DB)', async () => {
    createSelectChain([]);
    await expect(isClaimTokenValid('testartist', 'expired')).resolves.toBe(
      false
    );

    createSelectChain([]);
    await expect(lookupUsernameByClaimToken('expired')).resolves.toBeNull();
  });
});
