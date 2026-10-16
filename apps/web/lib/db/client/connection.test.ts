import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('discards the client when driver rollback fails', async () => {
    const rollbackError = new Error('rollback transport failed');
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(rollbackError);
    const failure = await database
      .transaction(async () => {
        throw new Error('operation failed');
      })
      .catch(error => error);
    expect(failure.cause).toBe(rollbackError);
    expect(mocks.clients[0].release).toHaveBeenCalledExactlyOnceWith(failure);
  });

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
