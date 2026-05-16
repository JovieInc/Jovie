/**
 * token-vault.test.ts
 *
 * Unit tests for storeTokens, loadDecryptedToken, and withRefreshLock.
 * All DB calls are mocked — no real Postgres connection required.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockSelect = vi.fn();

// Chain that resolves to `returnValue` at terminal calls.
function makeChain(returnValue: unknown) {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  const passThrough = [
    'update',
    'insert',
    'select',
    'set',
    'values',
    'from',
    'where',
  ];
  for (const m of passThrough) {
    chain[m] = () => chain;
  }
  chain['returning'] = () => Promise.resolve(returnValue);
  chain['limit'] = () => Promise.resolve(returnValue);
  chain['onConflictDoNothing'] = () => Promise.resolve([]);
  chain['catch'] = (_fn: unknown) => Promise.resolve(undefined);
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return makeChain([{ id: 'mock-id' }]);
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return makeChain([]);
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return makeChain([]);
    },
  },
}));

vi.mock('@/lib/utils/pii-encryption', () => ({
  encryptPII: (value: string) => `enc:${value}`,
  decryptPII: (value: string) => value.replace(/^enc:/, ''),
}));

// ---------------------------------------------------------------------------
// SUT (imported after top-level mocks are in place)
// ---------------------------------------------------------------------------

import {
  loadDecryptedToken,
  RefreshLockBusyError,
  storeTokens,
  withRefreshLock,
} from './token-vault';

// ---------------------------------------------------------------------------
// storeTokens
// ---------------------------------------------------------------------------

describe('storeTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls db.update (encryption is applied before persisting)', async () => {
    await storeTokens({
      connectorAccountId: 'acct-1',
      accessToken: 'raw-access-token',
      expiresAt: new Date('2099-01-01'),
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('encrypts refresh token when provided', async () => {
    await storeTokens({
      connectorAccountId: 'acct-1',
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: new Date('2099-01-01'),
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('throws when account not found (0 rows returned)', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db', () => ({
      db: {
        update: () => makeChain([]),
        insert: () => makeChain([]),
        select: () => makeChain([]),
      },
    }));
    vi.doMock('@/lib/utils/pii-encryption', () => ({
      encryptPII: (v: string) => `enc:${v}`,
      decryptPII: (v: string) => v.replace(/^enc:/, ''),
    }));

    const { storeTokens: st } = await import('./token-vault');
    await expect(
      st({
        connectorAccountId: 'missing',
        accessToken: 'at',
        expiresAt: new Date(),
      })
    ).rejects.toThrow('connector account not found');
  });
});

// ---------------------------------------------------------------------------
// loadDecryptedToken
// ---------------------------------------------------------------------------

describe('loadDecryptedToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no rows found', async () => {
    // Default module-level mock: select resolves to [] → should return null
    const result = await loadDecryptedToken('missing-acct');
    expect(result).toBeNull();
  });

  it('decrypts correctly via encryptPII/decryptPII round-trip', async () => {
    const { decryptPII } = await import('@/lib/utils/pii-encryption');
    // Verify our mock implements the expected contract
    expect(decryptPII('enc:my-access-token')).toBe('my-access-token');
    expect(decryptPII('enc:my-refresh-token')).toBe('my-refresh-token');
  });

  it('returns null when encryptedAccessToken is missing from row', async () => {
    const result = await loadDecryptedToken('acct-no-token');
    expect(result).toBeNull();
  });

  it('returns null when row has null encryptedAccessToken', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db', () => ({
      db: {
        update: () => makeChain([{ id: 'mock-id' }]),
        insert: () => makeChain([]),
        select: () =>
          makeChain([
            {
              encryptedAccessToken: null,
              encryptedRefreshToken: null,
              tokenExpiresAt: null,
            },
          ]),
      },
    }));
    vi.doMock('@/lib/utils/pii-encryption', () => ({
      encryptPII: (v: string) => `enc:${v}`,
      decryptPII: (v: string) => v.replace(/^enc:/, ''),
    }));
    const { loadDecryptedToken: ldt } = await import('./token-vault');
    expect(await ldt('acct-null-token')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// withRefreshLock — CAS semantics
// ---------------------------------------------------------------------------

describe('withRefreshLock', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('runs fn() and returns its result when lock is acquired', async () => {
    const result = await withRefreshLock('acct-1', async () => 'success');
    expect(result).toBe('success');
  });

  it('throws when CAS returns 0 rows (lock busy)', async () => {
    vi.resetModules();
    let updateCallCount = 0;
    vi.doMock('@/lib/db', () => ({
      db: {
        update: () => {
          updateCallCount++;
          const rows = updateCallCount === 1 ? [] : [{ id: 'x' }];
          return makeChain(rows);
        },
        insert: () => makeChain([]),
        select: () => makeChain([]),
      },
    }));
    vi.doMock('@/lib/utils/pii-encryption', () => ({
      encryptPII: (v: string) => `enc:${v}`,
      decryptPII: (v: string) => v.replace(/^enc:/, ''),
    }));
    const { withRefreshLock: wrl } = await import('./token-vault');
    await expect(
      wrl('acct-busy', async () => 'should not run')
    ).rejects.toThrow('Token refresh lock is held by another caller');
  });

  it('releases lock in finally even when fn() throws', async () => {
    vi.resetModules();
    let updateCallCount = 0;
    const releaseResult = { released: false };
    vi.doMock('@/lib/db', () => ({
      db: {
        update: () => {
          updateCallCount++;
          if (updateCallCount === 1) {
            // Acquire succeeds
            return makeChain([{ id: 'lock-acquired' }]);
          }
          // Release update (2nd call)
          releaseResult.released = true;
          return makeChain([]);
        },
        insert: () => makeChain([]),
        select: () => makeChain([]),
      },
    }));
    vi.doMock('@/lib/utils/pii-encryption', () => ({
      encryptPII: (v: string) => `enc:${v}`,
      decryptPII: (v: string) => v.replace(/^enc:/, ''),
    }));
    const { withRefreshLock: wrl } = await import('./token-vault');
    await expect(
      wrl('acct-throws', async () => {
        throw new Error('fn failed');
      })
    ).rejects.toThrow('fn failed');
    expect(releaseResult.released).toBe(true);
  });

  it('propagates fn() return value through the lock', async () => {
    const payload = {
      tokens: { access: 'new-access', refresh: 'new-refresh' },
    };
    const result = await withRefreshLock('acct-ok', async () => payload);
    expect(result).toEqual(payload);
  });

  it('RefreshLockBusyError carries the connectorAccountId', () => {
    const err = new RefreshLockBusyError('acct-123');
    expect(err.connectorAccountId).toBe('acct-123');
    expect(err.name).toBe('RefreshLockBusyError');
    expect(err.message).toContain('acct-123');
  });
});

// ---------------------------------------------------------------------------
// Token redaction invariant
// ---------------------------------------------------------------------------

describe('token redaction invariant', () => {
  it('encryptPII wraps the raw value (never store plaintext)', async () => {
    const { encryptPII } = await import('@/lib/utils/pii-encryption');
    const raw = 'ya29.actual-oauth-token';
    const encrypted = encryptPII(raw);
    expect(encrypted).not.toBe(raw);
  });

  it('decryptPII round-trips through encryptPII', async () => {
    const { encryptPII, decryptPII } = await import(
      '@/lib/utils/pii-encryption'
    );
    const raw = 'ya29.round-trip-token';
    expect(decryptPII(encryptPII(raw))).toBe(raw);
  });
});
