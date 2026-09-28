import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  rows: [] as unknown[],
  select: vi.fn(),
  getCachedAuth: vi.fn(),
  isAdmin: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('react', async importOriginal => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === '__investor_token' && mocks.cookieValue
        ? { value: mocks.cookieValue }
        : undefined,
  }),
}));
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/db/schema/investors', () => ({
  investorLinks: {
    investorName: 'investorName',
    expiresAt: 'expiresAt',
    token: 'token',
    isActive: 'isActive',
  },
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.getCachedAuth }));
vi.mock('@/lib/admin/roles', () => ({ isAdmin: mocks.isAdmin }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));

import { getInvestorPortalAccess } from './portal-access';

describe('getInvestorPortalAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValue = undefined;
    mocks.rows = [];
    mocks.select.mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => mocks.rows }) }),
    }));
    mocks.getCachedAuth.mockResolvedValue({ userId: null });
    mocks.isAdmin.mockResolvedValue(false);
  });

  it('grants an active investor link and keeps its name for the greeting', async () => {
    mocks.cookieValue = 'token-1';
    mocks.rows = [{ investorName: 'Ada', expiresAt: null }];

    await expect(getInvestorPortalAccess()).resolves.toEqual({
      kind: 'investor',
      investorName: 'Ada',
    });
    expect(mocks.getCachedAuth).not.toHaveBeenCalled();
  });

  it('rejects an expired investor link', async () => {
    mocks.cookieValue = 'token-1';
    mocks.rows = [{ investorName: 'Ada', expiresAt: new Date(0) }];

    await expect(getInvestorPortalAccess()).resolves.toBeNull();
  });

  it('rejects anonymous visitors', async () => {
    await expect(getInvestorPortalAccess()).resolves.toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('grants signed-in admins without an investor link', async () => {
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.isAdmin.mockResolvedValue(true);

    await expect(getInvestorPortalAccess()).resolves.toEqual({
      kind: 'admin',
    });
  });

  it('rejects signed-in non-admins', async () => {
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user-1' });

    await expect(getInvestorPortalAccess()).resolves.toBeNull();
  });

  it('fails closed when the lookup throws', async () => {
    mocks.cookieValue = 'token-1';
    mocks.select.mockImplementation(() => {
      throw new Error('db down');
    });

    await expect(getInvestorPortalAccess()).resolves.toBeNull();
    expect(mocks.captureError).toHaveBeenCalledTimes(1);
  });
});
