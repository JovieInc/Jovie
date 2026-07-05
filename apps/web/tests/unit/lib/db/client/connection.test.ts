import { afterEach, describe, expect, it } from 'vitest';

import {
  db,
  resolvePoolConfig,
  resolveStatementTimeoutMs,
  setInternalDb,
} from '@/lib/db/client/connection';
import type { DbType } from '@/lib/db/client/types';

const originalDb = db;

const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = mutableEnv.NODE_ENV;
const originalVitest = mutableEnv.VITEST;
const originalStatementTimeout = mutableEnv.DB_STATEMENT_TIMEOUT_MS;

describe('db proxy', () => {
  afterEach(() => {
    setInternalDb(originalDb as any);
    if (originalNodeEnv === undefined) {
      delete mutableEnv.NODE_ENV;
    } else {
      mutableEnv.NODE_ENV = originalNodeEnv;
    }

    if (originalVitest === undefined) {
      delete mutableEnv.VITEST;
    } else {
      mutableEnv.VITEST = originalVitest;
    }

    if (originalStatementTimeout === undefined) {
      delete mutableEnv.DB_STATEMENT_TIMEOUT_MS;
    } else {
      mutableEnv.DB_STATEMENT_TIMEOUT_MS = originalStatementTimeout;
    }
  });
  it('binds function properties to underlying db instance', () => {
    const mockDb = {
      marker: 'expected-context',
      readMarker(this: { marker: string }) {
        return this.marker;
      },
    } as unknown as DbType;

    setInternalDb(mockDb);

    const readMarker = (db as unknown as { readMarker: () => string })
      .readMarker;

    expect(readMarker()).toBe('expected-context');
  });

  it('uses a single pooled connection in test env', () => {
    mutableEnv.NODE_ENV = 'test';
    delete mutableEnv.VITEST;

    const config = resolvePoolConfig('postgres://localhost:5432/test');

    expect(config.max).toBe(1);
  });

  it('uses default pool max outside test env', () => {
    mutableEnv.NODE_ENV = 'development';
    delete mutableEnv.VITEST;

    const config = resolvePoolConfig('postgres://localhost:5432/dev');

    expect(config.max).toBe(20);
  });

  it('omits statement_timeout when DB_STATEMENT_TIMEOUT_MS is unset', () => {
    delete mutableEnv.DB_STATEMENT_TIMEOUT_MS;

    const config = resolvePoolConfig('postgres://localhost:5432/dev');

    expect(config.statement_timeout).toBeUndefined();
  });

  it('applies statement_timeout when DB_STATEMENT_TIMEOUT_MS is set', () => {
    mutableEnv.DB_STATEMENT_TIMEOUT_MS = '15000';

    const config = resolvePoolConfig('postgres://localhost:5432/dev');

    expect(config.statement_timeout).toBe(15_000);
  });

  it('ignores invalid DB_STATEMENT_TIMEOUT_MS values', () => {
    mutableEnv.DB_STATEMENT_TIMEOUT_MS = 'not-a-number';

    expect(resolveStatementTimeoutMs()).toBeUndefined();
    expect(
      resolvePoolConfig('postgres://localhost:5432/dev').statement_timeout
    ).toBeUndefined();
  });
  it('returns non-function properties unchanged', () => {
    const mockDb = {
      driverName: 'neon-http',
    } as unknown as DbType;

    setInternalDb(mockDb);

    expect((db as unknown as { driverName: string }).driverName).toBe(
      'neon-http'
    );
  });
});
