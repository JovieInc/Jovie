import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('Database Connection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('throws error when DATABASE_URL is missing', async () => {
    // Mock the environment module
    vi.doMock('../../lib/env-server', () => ({
      env: {
        DATABASE_URL: undefined,
      },
    }));

    const { getDb } = await import('../../drizzle/config');
    expect(() => getDb()).toThrow('DATABASE_URL is not defined');
  });

  test('selects postgres driver for standard postgres URL', async () => {
    vi.doMock('../../lib/env-server', () => ({
      env: {
        DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      },
    }));

    const { getDb } = await import('../../drizzle/config');

    // This should not throw
    expect(() => getDb()).not.toThrow();
  });

  test('selects postgres driver for postgresql URL', async () => {
    vi.doMock('../../lib/env-server', () => ({
      env: {
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      },
    }));

    const { getDb } = await import('../../drizzle/config');

    // This should not throw
    expect(() => getDb()).not.toThrow();
  });

  test('selects neon driver for postgres+neon URL', async () => {
    vi.doMock('../../lib/env-server', () => ({
      env: {
        DATABASE_URL: 'postgres+neon://user:pass@host/db',
      },
    }));

    const { getDb } = await import('../../drizzle/config');

    // This should not throw
    expect(() => getDb()).not.toThrow();
  });

  test('selects neon driver for postgresql+neon URL', async () => {
    vi.doMock('../../lib/env-server', () => ({
      env: {
        DATABASE_URL: 'postgresql+neon://user:pass@host/db',
      },
    }));

    const { getDb } = await import('../../drizzle/config');

    // This should not throw
    expect(() => getDb()).not.toThrow();
  });

  test('handles connection cleanup properly', async () => {
    vi.doMock('../../lib/env-server', () => ({
      env: {
        DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      },
    }));

    const { getDb, closeDb } = await import('../../drizzle/config');

    getDb(); // Create connection

    // This should not throw
    await expect(closeDb()).resolves.not.toThrow();
  });

  test('reuses connection in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      vi.doMock('../../lib/env-server', () => ({
        env: {
          DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
        },
      }));

      const { getDb } = await import('../../drizzle/config');

      const db1 = getDb();
      const db2 = getDb();

      // Should be the same instance in development
      expect(db1).toBe(db2);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test('creates new connection in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      vi.doMock('../../lib/env-server', () => ({
        env: {
          DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
        },
      }));

      const { getDb } = await import('../../drizzle/config');

      const db1 = getDb();
      const db2 = getDb();

      // Should be different instances in production
      expect(db1).not.toBe(db2);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
