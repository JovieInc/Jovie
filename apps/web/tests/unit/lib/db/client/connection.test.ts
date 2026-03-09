import { afterEach, describe, expect, it } from 'vitest';

import { db, setInternalDb } from '@/lib/db/client/connection';
import type { DbType } from '@/lib/db/client/types';

const originalDb = db;

describe('db proxy', () => {
  afterEach(() => {
    setInternalDb(originalDb as any);
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
