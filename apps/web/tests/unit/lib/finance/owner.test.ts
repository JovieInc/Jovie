import { describe, expect, it, vi } from 'vitest';

const mockGetCachedAuth = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

const OWNER_ID = '11111111-2222-3333-4444-555555555555';
const OTHER_ID = '99999999-8888-7777-6666-555555555555';

describe('requireFinancialOwnerId', () => {
  it('returns the authenticated users.id', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: OWNER_ID });
    const { requireFinancialOwnerId } = await import('@/lib/finance/owner');
    await expect(requireFinancialOwnerId()).resolves.toBe(OWNER_ID);
  });

  it('throws UnauthorizedSessionError when unauthenticated', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });
    const { requireFinancialOwnerId } = await import('@/lib/finance/owner');
    const { UnauthorizedSessionError } = await import('@/lib/auth/session');
    await expect(requireFinancialOwnerId()).rejects.toBeInstanceOf(
      UnauthorizedSessionError
    );
  });

  it('rejects a non-UUID principal (e.g. a creator or legacy id)', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_2abc' });
    const { requireFinancialOwnerId } = await import('@/lib/finance/owner');
    await expect(requireFinancialOwnerId()).rejects.toThrow('Unauthorized');
  });
});

describe('assertFinancialOwnerId', () => {
  it('accepts a users.id UUID', async () => {
    const { assertFinancialOwnerId } = await import('@/lib/finance/owner');
    expect(assertFinancialOwnerId(OWNER_ID)).toBe(OWNER_ID);
    expect(assertFinancialOwnerId(OTHER_ID)).toBe(OTHER_ID);
  });

  it.each([
    ['creator profile id shape', 'creator_123'],
    ['clerk-style id', 'user_2abc'],
    ['system identity', 'system_ingest'],
    ['empty string', ''],
    ['non-string', 42],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', async (_label, value) => {
    const { assertFinancialOwnerId } = await import('@/lib/finance/owner');
    expect(() => assertFinancialOwnerId(value)).toThrow(
      'Invalid financial owner id'
    );
  });
});
