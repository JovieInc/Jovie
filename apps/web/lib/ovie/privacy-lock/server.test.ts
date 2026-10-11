import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  results: [] as unknown[][],
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  writes: [] as unknown[],
  conflictChanged: true,
  syntheticCapture: false,
  bypassSession: null as { dbUserId: string } | null,
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.remove,
  },
}));
vi.mock('@/lib/auth/cached', () => ({
  getFreshAuth: vi.fn(async () => ({ userId: 'u1', sessionId: 's1' })),
}));
vi.mock('@/lib/e2e/runtime', () => ({
  isVisualCaptureSyntheticAuthEnabled: () => mocks.syntheticCapture,
}));
vi.mock('@/lib/auth/dev-test-auth.server', () => ({
  getCachedDevTestAuthSession: vi.fn(async () => mocks.bypassSession),
}));

import {
  assertOviePrivacyUnlocked,
  getOviePrivacyLockState,
  mutateOviePrivacyLock,
} from './server';

const now = new Date('2026-09-29T20:00:00Z');
const enabled = {
  enabled: true,
  version: 2,
  lockedAt: new Date(now.getTime() - 1000),
};
const auth = { userId: 'u1', sessionId: 's1' };
const unlocked = {
  value: JSON.stringify({
    userId: 'u1',
    version: 2,
    unlockedAt: now.getTime(),
  }),
  expiresAt: new Date(now.getTime() + 86400000),
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.results = [];
  mocks.writes = [];
  mocks.conflictChanged = true;
  mocks.syntheticCapture = false;
  mocks.bypassSession = null;
  vi.clearAllMocks();
  mocks.select.mockImplementation(() => {
    const q: any = {
      from: () => q,
      innerJoin: () => q,
      leftJoin: () => q,
      where: () => q,
      limit: async () => mocks.results.shift() ?? [],
    };
    return q;
  });
  mocks.insert.mockImplementation(() => ({
    values: (value: unknown) => {
      mocks.writes.push(value);
      return {
        onConflictDoUpdate: () => ({
          returning: async () =>
            mocks.conflictChanged ? [{ userId: 'u1' }] : [],
          then: (resolve: (value: undefined) => void) => resolve(undefined),
        }),
        onConflictDoNothing: async () => {},
      };
    },
  }));
  mocks.remove.mockImplementation(() => ({ where: async () => {} }));
  mocks.update.mockImplementation(() => ({
    set: (value: unknown) => {
      mocks.writes.push(value);
      return { where: () => ({ returning: async () => [{ userId: 'u1' }] }) };
    },
  }));
});
describe('session-bound Ovie privacy persistence', () => {
  it('does not query receipts when privacy is default-off', async () => {
    mocks.results = [[]];
    expect(await getOviePrivacyLockState(auth)).toEqual({
      enabled: false,
      locked: false,
      unlockedUntil: null,
    });
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
  it('fails closed on storage errors', async () => {
    mocks.select.mockImplementation(() => {
      throw Error('DB down');
    });
    await expect(assertOviePrivacyUnlocked(auth)).rejects.toThrow('DB down');
  });
  it('skips the Postgres policy read for the synthetic capture session', async () => {
    mocks.syntheticCapture = true;
    mocks.bypassSession = { dbUserId: 'u1' };
    mocks.select.mockImplementation(() => {
      throw Error('DB down');
    });
    await expect(assertOviePrivacyUnlocked(auth)).resolves.toBeUndefined();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it('still checks the policy for real sessions while capture is enabled', async () => {
    mocks.syntheticCapture = true;
    mocks.results = [[enabled], []];
    await expect(assertOviePrivacyUnlocked(auth)).rejects.toMatchObject({
      code: 'PRIVACY_UNLOCK_REQUIRED',
    });
    expect(mocks.select).toHaveBeenCalled();
  });
  it('rejects access to opted-in locked data', async () => {
    mocks.results = [[enabled], []];
    await expect(assertOviePrivacyUnlocked(auth)).rejects.toMatchObject({
      code: 'PRIVACY_UNLOCK_REQUIRED',
    });
  });
  it('allows existing 24-hour receipt', async () => {
    mocks.results = [[enabled], [unlocked]];
    await expect(assertOviePrivacyUnlocked(auth)).resolves.toBeUndefined();
  });
  it('rejects replay from another user', async () => {
    mocks.results = [
      [enabled],
      [
        {
          ...unlocked,
          value: JSON.stringify({
            userId: 'u2',
            version: 2,
            unlockedAt: now.getTime(),
          }),
        },
      ],
    ];
    await expect(assertOviePrivacyUnlocked(auth)).rejects.toMatchObject({
      code: 'PRIVACY_UNLOCK_REQUIRED',
    });
  });
  it('mints exactly24h from fresh post-ceremony proof', async () => {
    mocks.results = [
      [enabled],
      [enabled],
      [],
      [
        {
          value: now.toISOString(),
          expiresAt: new Date(now.getTime() + 43200000),
        },
      ],
      [enabled],
      [unlocked],
    ];
    expect((await mutateOviePrivacyLock(auth, 'unlock')).locked).toBe(false);
    expect(mocks.writes).toHaveLength(1);
    expect(mocks.writes[0]).toMatchObject({
      id: 'ovie-privacy-unlock:s1',
      expiresAt: new Date(now.getTime() + 86400000),
    });
  });
  it('renews an expired deterministic receipt only after a fresh ceremony', async () => {
    let persisted = { ...unlocked, expiresAt: new Date(now.getTime() - 1) };
    mocks.results = [
      [enabled],
      [enabled],
      [persisted],
      [
        {
          value: now.toISOString(),
          expiresAt: new Date(now.getTime() + 43200000),
        },
      ],
      [enabled],
    ];
    const select = mocks.select.getMockImplementation()!;
    mocks.select.mockImplementation(() => {
      const query = select();
      query.limit = async () => mocks.results.shift() ?? [persisted];
      return query;
    });
    mocks.insert.mockImplementation(() => ({
      values: (receipt: typeof persisted) => ({
        // Model the existing deterministic primary-key row: ignore cannot renew it.
        onConflictDoNothing: async () => {},
        onConflictDoUpdate: async () => {
          persisted = receipt;
        },
      }),
    }));
    expect((await mutateOviePrivacyLock(auth, 'unlock')).unlockedUntil).toBe(
      unlocked.expiresAt.toISOString()
    );
  });
  it('does not refresh expiry on repeated unlock', async () => {
    mocks.results = [[enabled], [enabled], [unlocked]];
    expect((await mutateOviePrivacyLock(auth, 'unlock')).unlockedUntil).toBe(
      unlocked.expiresAt.toISOString()
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('does not unlock without passkey proof', async () => {
    mocks.results = [[enabled], [enabled], [], []];
    await expect(mutateOviePrivacyLock(auth, 'unlock')).rejects.toMatchObject({
      code: 'PASSKEY_STEP_UP_REQUIRED',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('does not replay pre-relock ceremony', async () => {
    mocks.results = [
      [enabled],
      [enabled],
      [],
      [
        {
          value: new Date(now.getTime() - 1001).toISOString(),
          expiresAt: new Date(now.getTime() + 1000),
        },
      ],
    ];
    await expect(mutateOviePrivacyLock(auth, 'unlock')).rejects.toMatchObject({
      code: 'PASSKEY_STEP_UP_REQUIRED',
    });
  });
  it('rejects a racing relock after receipt mint', async () => {
    mocks.results = [
      [enabled],
      [enabled],
      [],
      [{ value: now.toISOString(), expiresAt: new Date(now.getTime() + 1000) }],
      [{ ...enabled, version: 3 }],
      [],
    ];
    await expect(mutateOviePrivacyLock(auth, 'unlock')).rejects.toMatchObject({
      code: 'PRIVACY_STATE_CHANGED',
    });
  });
  it('enables persistent policy and invalidates current receipt', async () => {
    mocks.results = [[], [{ id: 'eligible-key' }], [enabled], []];
    expect((await mutateOviePrivacyLock(auth, 'enable')).locked).toBe(true);
    expect(mocks.writes[0]).toMatchObject({
      oviePrivacyLockEnabled: true,
      oviePrivacyLockVersion: 1,
      oviePrivacyLockedAt: now,
    });
    expect(mocks.remove).toHaveBeenCalled();
  });
  it('cannot disable opted-in lock without valid unlock', async () => {
    mocks.results = [[enabled], [enabled], []];
    await expect(mutateOviePrivacyLock(auth, 'disable')).rejects.toMatchObject({
      code: 'PRIVACY_UNLOCK_REQUIRED',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('disables unlocked privacy atomically against lock version', async () => {
    mocks.results = [
      [enabled],
      [enabled],
      [unlocked],
      [{ ...enabled, enabled: false }],
    ];
    expect((await mutateOviePrivacyLock(auth, 'disable')).enabled).toBe(false);
    expect(mocks.writes[0]).toMatchObject({ oviePrivacyLockEnabled: false });
  });
  it('enable retry leaves an existing unlock intact', async () => {
    mocks.results = [[enabled], [enabled], [unlocked]];
    expect((await mutateOviePrivacyLock(auth, 'enable')).locked).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('concurrent enable preserves the winning unlock without deleting it', async () => {
    mocks.conflictChanged = false;
    mocks.results = [[], [{ id: 'eligible-key' }], [enabled], [unlocked]];
    expect((await mutateOviePrivacyLock(auth, 'enable')).locked).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('rejects enable when no admin-capable passkey exists', async () => {
    mocks.results = [[], []];
    await expect(mutateOviePrivacyLock(auth, 'enable')).rejects.toMatchObject({
      code: 'PASSKEY_SETUP_REQUIRED',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('anchors24h expiry to verified ceremony rather than request time', async () => {
    const proofAt = now.getTime() - 500;
    const receipt = {
      value: JSON.stringify({ userId: 'u1', version: 2, unlockedAt: proofAt }),
      expiresAt: new Date(proofAt + 86400000),
    };
    mocks.results = [
      [enabled],
      [enabled],
      [],
      [
        {
          value: new Date(proofAt).toISOString(),
          expiresAt: new Date(now.getTime() + 1000),
        },
      ],
      [enabled],
      [receipt],
    ];
    await mutateOviePrivacyLock(auth, 'unlock');
    expect(mocks.writes[0]).toMatchObject({
      expiresAt: new Date(proofAt + 86400000),
    });
  });
});
