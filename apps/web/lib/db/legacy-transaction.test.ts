import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logDbErrorMock, transactionMock } = vi.hoisted(() => ({
  logDbErrorMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db', () => ({
  db: { transaction: transactionMock },
  applyRlsTransactionUser: vi.fn(),
}));

vi.mock('./client/logging', () => ({
  logDbError: logDbErrorMock,
}));

import {
  runAtomicDbOperation,
  runLegacyDbTransaction,
} from './legacy-transaction';

describe('runLegacyDbTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the operation error when rollback also fails', async () => {
    const operationError = new Error('write failed');
    const rollbackError = new Error('Failed query: rollback');
    const tx = { execute: vi.fn() };

    transactionMock.mockImplementation(
      async (operation: (transaction: typeof tx) => Promise<unknown>) => {
        try {
          await operation(tx);
        } catch {
          throw rollbackError;
        }
      }
    );

    await expect(
      runLegacyDbTransaction(async () => {
        throw operationError;
      })
    ).rejects.toBe(operationError);

    expect(logDbErrorMock).toHaveBeenCalledWith(
      'transaction_rollback_failed',
      rollbackError,
      {
        operationErrorMessage: 'write failed',
        operationErrorName: 'Error',
      },
      { asBreadcrumb: true }
    );
  });

  it('keeps transaction failures that occur outside the operation', async () => {
    const transactionError = new Error('Failed query: begin');
    transactionMock.mockRejectedValue(transactionError);

    await expect(runLegacyDbTransaction(async () => 'unused')).rejects.toBe(
      transactionError
    );
    expect(logDbErrorMock).not.toHaveBeenCalled();
  });

  it('returns a successful transaction result unchanged', async () => {
    const tx = { execute: vi.fn() };
    transactionMock.mockImplementation(
      async (operation: (transaction: typeof tx) => Promise<unknown>) =>
        operation(tx)
    );

    await expect(
      runLegacyDbTransaction(async transaction => {
        expect(transaction).toBe(tx);
        return 'saved';
      })
    ).resolves.toBe('saved');
    expect(logDbErrorMock).not.toHaveBeenCalled();
  });
});

describe('atomic retry boundary', () => {
  it('does not replay an ambiguous commit or a no-retry operation', async () => {
    const failure = new Error('connection lost during COMMIT');
    transactionMock.mockReset().mockImplementation(async fn => {
      await fn({ execute: vi.fn() });
      throw failure;
    });
    await expect(
      runAtomicDbOperation(async () => 'written', {
        actorId: 'trusted-user',
        retry: 'serialization',
      })
    ).rejects.toBe(failure);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    transactionMock
      .mockReset()
      .mockRejectedValue(
        Object.assign(new Error('aborted'), { code: '40001' })
      );
    await expect(
      runAtomicDbOperation(async () => 'unused', {
        actorId: 'trusted-user',
        retry: 'never',
      })
    ).rejects.toThrow('aborted');
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
