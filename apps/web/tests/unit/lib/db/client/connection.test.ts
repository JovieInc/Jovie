import { afterEach, describe, expect, it } from 'vitest';

import {
  db,
  resolvePoolConfig,
  setInternalDb,
} from '@/lib/db/client/connection';
import type { DbType } from '@/lib/db/client/types';

const originalDb = db;

const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = mutableEnv.NODE_ENV;
const originalVitest = mutableEnv.VITEST;

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

    expect(config.max).toBe(10);
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
