import { beforeEach, describe, expect, it, vi } from 'vitest';

const owner = '11111111-1111-4111-8111-111111111111';
const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  setupSession: vi.fn(),
  institutions: vi.fn(),
  accounts: vi.fn(),
  transactions: vi.fn(),
}));
vi.mock('@/lib/finance/owner', () => ({
  requireFinancialOwnerId: mocks.requireOwner,
}));
vi.mock('@/lib/auth/session', () => ({ setupDbSession: mocks.setupSession }));
vi.mock('@/lib/finance/repository', () => ({
  listFinanceInstitutions: mocks.institutions,
  listFinanceAccounts: mocks.accounts,
  listFinanceTransactions: mocks.transactions,
}));

import { getMoneyOverview } from '@/lib/finance/overview';

describe('Money overview owner-scoped database session', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireOwner.mockResolvedValue(owner);
    mocks.setupSession.mockResolvedValue({ userId: owner });
    mocks.institutions.mockResolvedValue([]);
    mocks.accounts.mockResolvedValue([]);
    mocks.transactions.mockResolvedValue([]);
  });

  it('waits for the authenticated owner session before starting any finance read', async () => {
    let release!: () => void;
    mocks.setupSession.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        })
    );
    const overview = getMoneyOverview();
    await vi.waitFor(() =>
      expect(mocks.setupSession).toHaveBeenCalledWith(owner)
    );
    expect(mocks.institutions).not.toHaveBeenCalled();
    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(mocks.transactions).not.toHaveBeenCalled();
    release();
    await overview;
    expect(mocks.institutions).toHaveBeenCalledWith(owner);
    expect(mocks.accounts).toHaveBeenCalledWith(owner);
    expect(mocks.transactions).toHaveBeenCalledWith(owner, { limit: 10_000 });
  });

  it.each(['owner', 'session'])(
    'does not read finance data when %s initialization fails',
    async boundary => {
      const failure = new Error('authorization unavailable');
      (boundary === 'owner'
        ? mocks.requireOwner
        : mocks.setupSession
      ).mockRejectedValue(failure);
      await expect(getMoneyOverview()).rejects.toBe(failure);
      expect(mocks.institutions).not.toHaveBeenCalled();
      expect(mocks.accounts).not.toHaveBeenCalled();
      expect(mocks.transactions).not.toHaveBeenCalled();
      if (boundary === 'owner')
        expect(mocks.setupSession).not.toHaveBeenCalled();
    }
  );
});
