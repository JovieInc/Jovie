import { EventEmitter } from 'node:events';
import { sql as drizzleSql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPool } from './connection';
import type { DbType } from './types';

type FixtureClient = EventEmitter & {
  release: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
};
let database: DbType;

const mocks = vi.hoisted(() => ({
  pool: undefined as EventEmitter | undefined,
  logDbError: vi.fn(),
  clients: [] as FixtureClient[],
  query: vi.fn(),
}));

vi.mock('@neondatabase/serverless', async importOriginal => {
  const { EventEmitter } = await import('node:events');
  const actual =
    await importOriginal<typeof import('@neondatabase/serverless')>();
  return {
    ...actual,
    Pool: class extends actual.Pool {
      constructor() {
        super({});
        mocks.pool = this as unknown as EventEmitter;
        this.connect = this.connectFixture.bind(
          this
        ) as unknown as typeof this.connect;
      }
      async connectFixture() {
        const client = new EventEmitter() as FixtureClient;
        this.emit('connect', client);
        this.emit('acquire', client);
        client.release = vi.fn(error => this.emit('release', error, client));
        client.query = mocks.query;
        mocks.clients.push(client);
        return client;
      }
    },
  };
});
vi.mock('@/lib/env-server', () => ({
  env: { DATABASE_URL: 'postgres://localhost/fixture', NODE_ENV: 'production' },
  isTestEnv: () => true,
}));
vi.mock('../schema', () => ({}));
vi.mock('./logging', () => ({
  logDbError: mocks.logDbError,
  logDbInfo: vi.fn(),
}));
vi.mock('@/lib/db', async () => ({
  db: (await import('./connection')).db,
  applyRlsTransactionUser: vi.fn(),
}));

describe('enforced database deadlines (JOV-8527)', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.clients.length = 0;
    mocks.query.mockReset().mockResolvedValue({ rows: [] });
    const { initializeDb } = await import('./connection');
    database = initializeDb();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves the pool reset even when teardown never finishes', async () => {
    vi.useFakeTimers();
    const endSpy = vi
      .spyOn(mocks.pool as unknown as { end: () => Promise<void> }, 'end')
      .mockImplementation(() => new Promise<void>(() => {}));

    const pending = resetPool();
    const assertion = expect(pending).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;

    expect(mocks.logDbError).toHaveBeenCalledWith(
      'pool_reset_cleanup_timeout',
      expect.any(Error),
      {},
      { asBreadcrumb: true }
    );
    endSpy.mockRestore();
  });

  it('still ends the old pool when teardown finishes within the deadline', async () => {
    const endSpy = vi
      .spyOn(mocks.pool as unknown as { end: () => Promise<void> }, 'end')
      .mockResolvedValue(undefined);

    await expect(resetPool()).resolves.toBeUndefined();

    expect(endSpy).toHaveBeenCalledExactlyOnce();
    expect(mocks.logDbError).not.toHaveBeenCalled();
    endSpy.mockRestore();
  });

  it('bounds cleanup without unhandled rejections when teardown fails late', async () => {
    vi.useFakeTimers();
    const lateRejection = new Error('teardown failed after the deadline');
    const endSpy = vi
      .spyOn(mocks.pool as unknown as { end: () => Promise<void> }, 'end')
      .mockImplementation(
        () =>
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(lateRejection), 6_000);
          })
      );

    const pending = resetPool();
    const assertion = expect(pending).resolves.toBeUndefined();
    await vi.runAllTimersAsync();
    await assertion;

    endSpy.mockRestore();
  });
});

describe('checked-out database client failures (JOV-8523)', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.clients.length = 0;
    mocks.query.mockReset().mockResolvedValue({ rows: [] });
    const { initializeDb } = await import('./connection');
    database = initializeDb();
  });
  afterEach(() => vi.restoreAllMocks());

  it('handles an idle-in-transaction error between queries without throwing', () => {
    const client = new EventEmitter();
    mocks.pool!.emit('connect', client);
    mocks.pool!.emit('acquire', client);
    const error = new Error('server conn crashed?');

    expect(() => client.emit('error', error)).not.toThrow();
    expect(mocks.logDbError).toHaveBeenCalledWith(
      'client_error',
      error,
      { event: 'pool_checked_out_error' },
      { asBreadcrumb: true }
    );
  });

  it('removes the checkout listener on release and adds only one on reuse', () => {
    const client = new EventEmitter();
    const idleListener = vi.fn();
    mocks.pool!.emit('connect', client);
    for (let index = 0; index < 3; index += 1) {
      mocks.pool!.emit('acquire', client);
      expect(client.listenerCount('error')).toBe(1);
      // The driver installs its idle listener before emitting release.
      client.on('error', idleListener);
      mocks.pool!.emit('release', undefined, client);
      expect(client.listenerCount('error')).toBe(1);
      client.emit('error', new Error('idle pool error'));
      client.removeListener('error', idleListener);
    }
    expect(idleListener).toHaveBeenCalledTimes(3);
    expect(mocks.logDbError).not.toHaveBeenCalled();
  });

  it('preserves the driver query rejection listener', () => {
    const client = new EventEmitter();
    mocks.pool!.emit('acquire', client);
    const rejectQuery = vi.fn();
    client.once('error', rejectQuery);
    const error = new Error(
      'terminating connection due to idle-in-transaction timeout'
    );
    expect(() => client.emit('error', error)).not.toThrow();
    expect(rejectQuery).toHaveBeenCalledWith(error);
  });

  it('releases and discards the checked-out client when BEGIN fails before the callback', async () => {
    const error = new Error('server conn crashed during BEGIN');
    mocks.query.mockImplementationOnce(async () => {
      mocks.clients[0].emit('error', error);
      throw error;
    });
    const callback = vi.fn();
    const failure = await database.transaction(callback).catch(error => error);
    expect(failure).toMatchObject({ cause: error });
    expect(callback).not.toHaveBeenCalled();
    expect(mocks.clients).toHaveLength(1);
    expect(mocks.clients[0].release).toHaveBeenCalledExactlyOnceWith(failure);
    expect(mocks.clients[0].listenerCount('error')).toBe(0);
  });

  it('releases a successful transaction once and returns its result', async () => {
    await expect(
      database.transaction(async () => 'committed', {
        isolationLevel: 'serializable',
        accessMode: 'read only',
      })
    ).resolves.toBe('committed');
    expect(mocks.query.mock.calls[0][0].text).toBe(
      'begin isolation level serializable read only'
    );
    expect(mocks.clients).toHaveLength(1);
    expect(mocks.clients[0].release).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('discards a client after callback failure without replacing the error', async () => {
    const error = new Error('callback failed');
    await expect(
      database.transaction(async () => {
        throw error;
      })
    ).rejects.toBe(error);
    expect(mocks.clients).toHaveLength(1);
    expect(mocks.clients[0].release).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('preserves a mid-transaction connection failure when rollback also fails', async () => {
    const connectionError = new Error('connection terminated unexpectedly');
    const rollbackError = new Error('client is not queryable');
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockImplementationOnce(async () => {
        mocks.clients[0].emit('error', connectionError);
        throw connectionError;
      })
      .mockRejectedValueOnce(rollbackError);

    const failure = await database
      .transaction(tx => tx.execute(drizzleSql`select 1`))
      .catch(error => error);

    expect(failure).toMatchObject({
      query: 'select 1',
      cause: connectionError,
    });
    expect(mocks.query.mock.calls.map(call => call[0].text)).toEqual([
      'begin ',
      'select 1',
      'rollback',
    ]);
    expect(mocks.logDbError).toHaveBeenCalledWith(
      'transaction_rollback_failed',
      expect.objectContaining({ query: 'rollback', cause: rollbackError }),
      expect.objectContaining({ operationErrorName: 'Error' }),
      { asBreadcrumb: true }
    );
    expect(mocks.clients[0].release).toHaveBeenCalledExactlyOnceWith(failure);
    expect(mocks.clients[0].listenerCount('error')).toBe(0);
    await expect(database.transaction(async () => 'recovered')).resolves.toBe(
      'recovered'
    );
    expect(mocks.clients).toHaveLength(2);
  });

  it('preserves an uncertain commit failure when rollback also fails', async () => {
    const commitError = new Error('connection lost during COMMIT');
    const rollbackError = new Error('client is not queryable');
    const operation = vi.fn(async () => 'written');
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(commitError)
      .mockRejectedValueOnce(rollbackError);

    const failure = await database.transaction(operation).catch(error => error);

    expect(failure).toMatchObject({ query: 'commit', cause: commitError });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls.map(call => call[0].text)).toEqual([
      'begin ',
      'commit',
      'rollback',
    ]);
    expect(mocks.logDbError).toHaveBeenCalledWith(
      'transaction_rollback_failed',
      expect.objectContaining({ query: 'rollback', cause: rollbackError }),
      expect.any(Object),
      { asBreadcrumb: true }
    );
    expect(mocks.clients[0].release).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it('preserves nested failures even if both savepoint and transaction rollback fail', async () => {
    const operationError = new Error('connection died inside a savepoint');
    mocks.query.mockImplementation(async query => {
      if (query.text.startsWith('rollback')) {
        throw new Error('client is not queryable');
      }
      return { rows: [] };
    });

    await expect(
      database.transaction(tx =>
        tx.transaction(async () => {
          mocks.clients[0].emit('error', operationError);
          throw operationError;
        })
      )
    ).rejects.toBe(operationError);
    expect(mocks.clients).toHaveLength(1);
    expect(mocks.clients[0].release).toHaveBeenCalledExactlyOnceWith(
      operationError
    );
    expect(
      mocks.logDbError.mock.calls.filter(
        call => call[0] === 'transaction_rollback_failed'
      )
    ).toHaveLength(2);
  });

  it.each(['legacy', 'atomic'] as const)(
    'preserves commit errors through the %s wrapper without replay',
    async wrapper => {
      const { runAtomicDbOperation, runLegacyDbTransaction } = await import(
        '../legacy-transaction'
      );
      const commitError = new Error('connection lost during COMMIT');
      mocks.query.mockImplementation(async query => {
        if (query.text === 'commit') throw commitError;
        if (query.text === 'rollback')
          throw new Error('client is not queryable');
        return { rows: [] };
      });
      const operation = vi.fn(async () => 'written');

      const result =
        wrapper === 'legacy'
          ? runLegacyDbTransaction(operation)
          : runAtomicDbOperation(operation, {
              actorId: 'trusted-user',
              retry: 'serialization',
            });
      const failure = await result.catch(error => error);

      expect(failure).toMatchObject({ query: 'commit', cause: commitError });
      expect(operation).toHaveBeenCalledTimes(1);
      expect(mocks.clients).toHaveLength(1);
      expect(mocks.clients[0].release).toHaveBeenCalledExactlyOnceWith(failure);
    }
  );

  it('aborts when the caller catches a failed savepoint rollback', async () => {
    const operationError = new Error('connection lost inside a savepoint');
    mocks.query.mockImplementation(async query => {
      if (query.text.startsWith('rollback to')) {
        throw new Error('savepoint rollback failed');
      }
      return { rows: [] };
    });
    await expect(
      database.transaction(async tx => {
        await tx
          .transaction(async () => {
            throw operationError;
          })
          .catch(() => undefined);
        return 'must not commit';
      })
    ).rejects.toBe(operationError);
    expect(mocks.query.mock.calls.map(call => call[0].text)).toEqual([
      'begin ',
      'savepoint sp1',
      'rollback to savepoint sp1',
      'rollback',
    ]);
    expect(mocks.clients[0].release).toHaveBeenCalledExactlyOnceWith(
      operationError
    );
  });

  it('commits after a recovered savepoint error when rollback succeeds', async () => {
    await expect(
      database.transaction(async tx => {
        await tx
          .transaction(async () => {
            throw new Error('recoverable failure');
          })
          .catch(() => undefined);
        return 'committed';
      })
    ).resolves.toBe('committed');
    expect(mocks.query.mock.calls.map(call => call[0].text)).toEqual([
      'begin ',
      'savepoint sp1',
      'rollback to savepoint sp1',
      'commit',
    ]);
    expect(mocks.clients[0].release).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it.each([undefined, null, 'operation failed'])(
    'preserves non-Error callback rejection %s when rollback fails',
    async operationError => {
      mocks.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('rollback failed'));
      await expect(
        database.transaction(async () => {
          throw operationError;
        })
      ).rejects.toBe(operationError);
      expect(mocks.clients[0].release).toHaveBeenCalledExactlyOnceWith(
        expect.any(Error)
      );
    }
  );

  it('keeps nested savepoints on the same checked-out client', async () => {
    await expect(
      database.transaction(tx => tx.transaction(async () => 'nested'))
    ).resolves.toBe('nested');
    expect(mocks.clients).toHaveLength(1);
    expect(mocks.query.mock.calls.map(call => call[0].text)).toEqual([
      'begin ',
      'savepoint sp1',
      'release savepoint sp1',
      'commit',
    ]);
    expect(mocks.clients[0].release).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});
