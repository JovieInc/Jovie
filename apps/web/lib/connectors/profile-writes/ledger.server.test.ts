import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectorWriteReceipts } from '@/lib/db/schema/connector-write-receipts';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import type { ProfileWriteReceipt } from './contract';
import { profileWriteLedger } from './ledger.server';

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const returning = vi.fn();
  const query = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit,
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning,
  };
  const tx = { select: vi.fn(() => query), insert: vi.fn(() => query) };
  return {
    tx,
    query,
    limit,
    returning,
    session: vi.fn(
      async (
        operation: (db: typeof tx) => Promise<unknown>,
        _options: { clerkUserId?: string }
      ) => operation(tx)
    ),
  };
});
vi.mock('@/lib/auth/session', () => ({ withDbSessionTx: mocks.session }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('durable connector write ledger', () => {
  it('requires the destination provider and current scopes on the authenticated account', async () => {
    mocks.limit.mockResolvedValue([
      { provider: 'youtube', scopes: ['profile.write'] },
    ]);
    const destination = {
      providerId: 'youtube',
      connectorAccountId: 'account',
      destinationAccountId: 'channel',
    };
    expect(
      await profileWriteLedger.authorize('user', destination, ['profile.write'])
    ).toBe(true);
    expect(mocks.query.from).toHaveBeenCalledWith(connectorAccounts);
    expect(mocks.session.mock.calls[0][1]).toEqual({ clerkUserId: 'user' });
    expect(
      await profileWriteLedger.authorize('user', destination, ['missing-scope'])
    ).toBe(false);
    expect(
      await profileWriteLedger.authorize(
        'user',
        { ...destination, providerId: 'spotify' },
        []
      )
    ).toBe(false);
    mocks.limit.mockResolvedValue([]);
    expect(await profileWriteLedger.authorize('user', destination, [])).toBe(
      false
    );
  });

  it('reads the tenant-scoped persisted receipt and returns null when absent', async () => {
    mocks.limit.mockResolvedValue([{ receipt: { id: 'receipt' } }]);
    expect(await profileWriteLedger.get('user', 'proposal', 'outcome')).toEqual(
      { id: 'receipt' }
    );
    expect(mocks.query.from).toHaveBeenCalledWith(connectorWriteReceipts);
    expect(mocks.session.mock.calls[0][1]).toEqual({ clerkUserId: 'user' });
    mocks.limit.mockResolvedValue([]);
    expect(
      await profileWriteLedger.get('user', 'proposal', 'outcome')
    ).toBeNull();
  });

  it('inserts only into the append-only ledger and propagates persistence failure', async () => {
    const receipt = {
      id: 'receipt',
      phase: 'started',
      proposal: {
        id: 'proposal',
        userId: 'user',
        connectorAccountId: 'account',
      },
    } as ProfileWriteReceipt;
    mocks.returning.mockResolvedValue([{ id: 'receipt' }]);
    expect(await profileWriteLedger.append(receipt, 'rate-window')).toBe(true);
    expect(mocks.tx.insert).toHaveBeenCalledWith(connectorWriteReceipts);
    expect(mocks.query.values).toHaveBeenCalledWith({
      id: 'receipt',
      userId: 'user',
      proposalId: 'proposal',
      connectorAccountId: 'account',
      phase: 'started',
      rateKey: 'rate-window',
      receipt,
    });
    expect(mocks.query.onConflictDoNothing).toHaveBeenCalled();
    mocks.returning.mockResolvedValue([]);
    expect(await profileWriteLedger.append(receipt)).toBe(false);
    mocks.returning.mockRejectedValue(new Error('database-unavailable'));
    await expect(profileWriteLedger.append(receipt)).rejects.toThrow(
      'database-unavailable'
    );
  });
});
