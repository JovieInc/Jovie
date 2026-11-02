import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbCircuitBreaker } from './circuit-breaker';
import { doesColumnExist, invalidateColumnExistenceCache } from './health';

const mocks = vi.hoisted(() => ({
  env: { DATABASE_URL: '', NODE_ENV: 'test' },
  execute: vi.fn(),
  logDbError: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({ env: mocks.env }));
vi.mock('./connection', () => ({
  getDb: () => ({ execute: mocks.execute }),
  getPoolMetrics: () => ({}),
}));
vi.mock('./logging', () => ({
  logDbError: mocks.logDbError,
  logDbInfo: vi.fn(),
}));

let databaseId = 0;

describe('doesColumnExist', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.execute.mockReset();
    mocks.env.DATABASE_URL = `postgresql://localhost/column-check-${++databaseId}`;
    dbCircuitBreaker.reset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('checks again immediately after a timeout instead of caching absence', async () => {
    mocks.execute
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({ rows: [{ column_exists: true }] });

    const pending = doesColumnExist('audience_members', 'latest_action_label');
    await vi.advanceTimersByTimeAsync(14_999);
    expect(mocks.logDbError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe(false);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.logDbError).toHaveBeenCalledWith(
      'columnExists',
      expect.any(Error),
      { tableName: 'audience_members', columnName: 'latest_action_label' }
    );

    expect(
      await doesColumnExist('audience_members', 'latest_action_label')
    ).toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('clears the timeout timer after a successful query', async () => {
    mocks.execute.mockResolvedValue({ rows: [{ column_exists: true }] });

    expect(await doesColumnExist('creator_profiles', 'settings')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['syntax error in SQL', 'Connection terminated unexpectedly'])(
    'does not cache a failed schema query: %s',
    async message => {
      mocks.execute
        .mockRejectedValueOnce(new Error(message))
        .mockResolvedValueOnce({ rows: [{ column_exists: true }] });

      expect(await doesColumnExist('creator_profiles', 'settings')).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      expect(await doesColumnExist('creator_profiles', 'settings')).toBe(true);
      expect(mocks.execute).toHaveBeenCalledTimes(2);
    }
  );

  it('caches confirmed absence until the TTL expires', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ column_exists: false }] })
      .mockResolvedValueOnce({ rows: [{ column_exists: true }] });

    expect(await doesColumnExist('creator_profiles', 'settings')).toBe(false);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(await doesColumnExist('creator_profiles', 'settings')).toBe(false);
    expect(mocks.execute).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(await doesColumnExist('creator_profiles', 'settings')).toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it.each([{ rows: [] }, { rows: [{ column_exists: 'false' }] }])(
    'does not cache an invalid schema result: %j',
    async ({ rows }) => {
      mocks.execute
        .mockResolvedValueOnce({ rows })
        .mockResolvedValueOnce({ rows: [{ column_exists: true }] });

      expect(await doesColumnExist('creator_profiles', 'settings')).toBe(false);
      expect(await doesColumnExist('creator_profiles', 'settings')).toBe(true);
      expect(mocks.execute).toHaveBeenCalledTimes(2);
    }
  );

  it('rechecks existing columns so schema rollbacks remain visible', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ column_exists: true }] })
      .mockResolvedValueOnce({ rows: [{ column_exists: false }] });

    expect(await doesColumnExist('creator_profiles', 'settings')).toBe(true);
    expect(await doesColumnExist('creator_profiles', 'settings')).toBe(false);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('invalidates a confirmed absence on request', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ column_exists: false }] })
      .mockResolvedValueOnce({ rows: [{ column_exists: true }] });

    expect(await doesColumnExist('creator_profiles', 'settings')).toBe(false);
    invalidateColumnExistenceCache('creator_profiles', 'settings');
    expect(await doesColumnExist('creator_profiles', 'settings')).toBe(true);
  });

  it('clears cached absence when the database changes', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ column_exists: false }] })
      .mockResolvedValueOnce({ rows: [{ column_exists: true }] });

    expect(await doesColumnExist('creator_profiles', 'settings')).toBe(false);
    mocks.env.DATABASE_URL = 'postgresql://localhost/another-column-check';
    expect(await doesColumnExist('creator_profiles', 'settings')).toBe(true);
  });

  it('returns false without querying when no database is configured', async () => {
    mocks.env.DATABASE_URL = '';

    expect(await doesColumnExist('creator_profiles', 'settings')).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
