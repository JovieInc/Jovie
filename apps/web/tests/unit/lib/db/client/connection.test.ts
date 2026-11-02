import { afterEach, describe, expect, it } from 'vitest';
import { atomicDbContext } from '@/lib/db/atomic-context';
import {
  classifyDatabaseEndpoint,
  db,
  evaluateFleetConnectionBudget,
  getDb,
  resolveAcquisitionTimeoutMs,
  resolvePoolConfig,
  resolvePoolMax,
  resolveStatementTimeoutMs,
  setInternalDb,
} from '@/lib/db/client/connection';
import type { DbType } from '@/lib/db/client/types';

const originalDb = db;

const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = mutableEnv.NODE_ENV;
const originalVitest = mutableEnv.VITEST;
const originalStatementTimeout = mutableEnv.DB_STATEMENT_TIMEOUT_MS;
const originalAcquisitionTimeout = mutableEnv.DB_ACQUISITION_TIMEOUT_MS;
const originalPoolMax = mutableEnv.DB_POOL_MAX;

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

    if (originalAcquisitionTimeout === undefined) {
      delete mutableEnv.DB_ACQUISITION_TIMEOUT_MS;
    } else {
      mutableEnv.DB_ACQUISITION_TIMEOUT_MS = originalAcquisitionTimeout;
    }

    if (originalPoolMax === undefined) {
      delete mutableEnv.DB_POOL_MAX;
    } else {
      mutableEnv.DB_POOL_MAX = originalPoolMax;
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

  it('rejects direct, indirect, and captured global methods inside atomic work', () => {
    setInternalDb({ select: () => 'ordinary read' } as unknown as DbType);
    const captured = db.select;
    expect(captured()).toBe('ordinary read');
    atomicDbContext.run({ actorId: 'trusted-user' }, () => {
      expect(() => db.select()).toThrow('transaction handle');
      expect(() => captured()).toThrow('transaction handle');
      expect(() => getDb()).toThrow('transaction handle');
    });
    expect(db.select()).toBe('ordinary read');
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

  it('allows only a downward per-process pool override', () => {
    mutableEnv.NODE_ENV = 'development';
    delete mutableEnv.VITEST;
    mutableEnv.DB_POOL_MAX = '6';
    expect(resolvePoolMax()).toBe(6);

    mutableEnv.DB_POOL_MAX = '200';
    expect(resolvePoolMax()).toBe(20);
    mutableEnv.DB_POOL_MAX = 'invalid';
    expect(resolvePoolMax()).toBe(20);
  });

  it('classifies Neon transaction pooler URLs without exposing credentials', () => {
    expect(
      classifyDatabaseEndpoint(
        'postgres://role:secret@ep-example-pooler.us-east-1.aws.neon.tech/db' // trufflehog:ignore
      )
    ).toBe('transaction-pooled');
    expect(
      classifyDatabaseEndpoint(
        'postgres://role:secret@ep-example.us-east-1.aws.neon.tech/db' // trufflehog:ignore
      )
    ).toBe('direct');
    expect(classifyDatabaseEndpoint('postgres://localhost/db')).toBe('other');
  });

  it('budgets overlapping pooled clients against backend rather than client ceiling', () => {
    expect(
      evaluateFleetConnectionBudget({
        adminConnections: 2,
        directWorkerConnections: 5,
        effectiveBackendLimit: 50,
        endpointMode: 'transaction-pooled',
        interactiveReserve: 10,
        overlappingDeployInstances: 2,
        peakInstances: 8,
        poolMax: 20,
        poolerBackendLimit: 30,
        testConnections: 0,
      })
    ).toEqual({
      applicationBackendCeiling: 30,
      applicationClientCeiling: 200,
      headroom: 13,
      missing: [],
      status: 'accepted',
      totalBackendCeiling: 37,
    });
  });

  it('rejects direct fleet pressure and keeps incomplete budgets unknown', () => {
    const direct = evaluateFleetConnectionBudget({
      adminConnections: 2,
      directWorkerConnections: 5,
      effectiveBackendLimit: 50,
      endpointMode: 'direct',
      interactiveReserve: 10,
      overlappingDeployInstances: 2,
      peakInstances: 8,
      poolMax: 20,
      testConnections: 0,
    });
    expect(direct.status).toBe('rejected');
    expect(direct.totalBackendCeiling).toBe(207);

    const unknown = evaluateFleetConnectionBudget({
      endpointMode: 'transaction-pooled',
      poolMax: 20,
    });
    expect(unknown.status).toBe('unknown');
    expect(unknown.missing).toContain('poolerBackendLimit');
  });

  it('enforces the default statement deadline when DB_STATEMENT_TIMEOUT_MS is unset', () => {
    delete mutableEnv.DB_STATEMENT_TIMEOUT_MS;

    const config = resolvePoolConfig('postgres://localhost:5432/dev');

    expect(config.statement_timeout).toBe(8000);
    expect(resolveStatementTimeoutMs()).toBe(8000);
  });

  it('applies statement_timeout when DB_STATEMENT_TIMEOUT_MS is set', () => {
    mutableEnv.DB_STATEMENT_TIMEOUT_MS = '15000';

    const config = resolvePoolConfig('postgres://localhost:5432/dev');

    expect(config.statement_timeout).toBe(15_000);
  });

  it('never lets invalid DB_STATEMENT_TIMEOUT_MS values disable the deadline', () => {
    mutableEnv.DB_STATEMENT_TIMEOUT_MS = 'not-a-number';

    expect(resolveStatementTimeoutMs()).toBe(8000);
    expect(
      resolvePoolConfig('postgres://localhost:5432/dev').statement_timeout
    ).toBe(8000);
  });

  it('caps oversized DB_STATEMENT_TIMEOUT_MS values at the enforced maximum', () => {
    mutableEnv.DB_STATEMENT_TIMEOUT_MS = '300000';

    expect(resolveStatementTimeoutMs()).toBe(30_000);
  });

  it('keeps a nonzero floor for DB_STATEMENT_TIMEOUT_MS', () => {
    mutableEnv.DB_STATEMENT_TIMEOUT_MS = '250';

    expect(resolveStatementTimeoutMs()).toBe(1000);
  });

  it('defaults and caps the acquisition deadline', () => {
    delete mutableEnv.DB_ACQUISITION_TIMEOUT_MS;
    expect(resolveAcquisitionTimeoutMs()).toBe(15_000);

    mutableEnv.DB_ACQUISITION_TIMEOUT_MS = 'not-a-number';
    expect(resolveAcquisitionTimeoutMs()).toBe(15_000);

    mutableEnv.DB_ACQUISITION_TIMEOUT_MS = '300000';
    expect(resolveAcquisitionTimeoutMs()).toBe(30_000);

    mutableEnv.DB_ACQUISITION_TIMEOUT_MS = '250';
    expect(resolveAcquisitionTimeoutMs()).toBe(1000);
  });

  it('always carries bounded acquisition and statement deadlines in pool config', () => {
    delete mutableEnv.DB_ACQUISITION_TIMEOUT_MS;
    delete mutableEnv.DB_STATEMENT_TIMEOUT_MS;

    const config = resolvePoolConfig('postgres://localhost:5432/dev');

    expect(config.connectionTimeoutMillis).toBe(15_000);
    expect(config.statement_timeout).toBe(8000);
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
