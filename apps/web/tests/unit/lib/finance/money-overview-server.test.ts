import { beforeEach, describe, expect, it, vi } from 'vitest';

const owner = '11111111-1111-4111-8111-111111111111';
const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  setupSession: vi.fn(),
  tx: { marker: 'pinned transaction' },
  institutions: vi.fn(),
  accounts: vi.fn(),
  transactions: vi.fn(),
  assertEnabled: vi.fn(),
}));
vi.mock('@/lib/finance/owner', () => ({
  requireFinancialOwnerId: mocks.requireOwner,
}));
vi.mock('@/lib/finance/flags', () => ({
  assertCreatorFinanceEnabled: mocks.assertEnabled,
}));
vi.mock('@/lib/auth/session', () => ({ withDbSessionTx: mocks.setupSession }));
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
    mocks.assertEnabled.mockResolvedValue(undefined);
    mocks.setupSession.mockImplementation(
      async (
        operation: (tx: typeof mocks.tx, userId: string) => Promise<unknown>
      ) => operation(mocks.tx, owner)
    );
    mocks.institutions.mockResolvedValue([]);
    mocks.accounts.mockResolvedValue([]);
    mocks.transactions.mockResolvedValue([]);
  });

  it('waits for the authenticated owner session before starting any finance read', async () => {
    let release!: () => void;
    mocks.setupSession.mockImplementation(
      async (
        operation: (tx: typeof mocks.tx, userId: string) => Promise<unknown>
      ) => {
        await new Promise<void>(resolve => {
          release = resolve;
        });
        return operation(mocks.tx, owner);
      }
    );
    const overview = getMoneyOverview();
    await vi.waitFor(() =>
      expect(mocks.setupSession).toHaveBeenCalledWith(expect.any(Function), {
        clerkUserId: owner,
        isolationLevel: 'repeatable read',
      })
    );
    expect(mocks.institutions).not.toHaveBeenCalled();
    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(mocks.transactions).not.toHaveBeenCalled();
    release();
    await overview;
    expect(mocks.institutions).toHaveBeenCalledWith(owner, mocks.tx);
    expect(mocks.accounts).toHaveBeenCalledWith(owner, mocks.tx);
    expect(mocks.transactions).toHaveBeenCalledWith(
      owner,
      { limit: 10_000 },
      mocks.tx
    );
  });

  it('does not read finance data when the creator finance flag is off', async () => {
    const failure = new Error('Creator finance is disabled');
    mocks.assertEnabled.mockRejectedValue(failure);
    await expect(getMoneyOverview()).rejects.toBe(failure);
    expect(mocks.setupSession).not.toHaveBeenCalled();
    expect(mocks.institutions).not.toHaveBeenCalled();
    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(mocks.transactions).not.toHaveBeenCalled();
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
