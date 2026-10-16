import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pool: undefined as EventEmitter | undefined,
  logDbError: vi.fn(),
}));

vi.mock('@neondatabase/serverless', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    neonConfig: {},
    Pool: class extends EventEmitter {
      totalCount = 1;
      constructor() {
        super();
        mocks.pool = this;
      }
    },
  };
});
vi.mock('drizzle-orm/neon-serverless', () => ({ drizzle: () => ({}) }));
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
    const { initializeDb } = await import('./connection');
    initializeDb();
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
});
