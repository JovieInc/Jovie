import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  failing: false,
  missing: false,
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({ env: {} }));
vi.mock('@/lib/redis', () => ({
  getRedis: () =>
    store.missing
      ? null
      : {
          get: async (key: string) => {
            if (store.failing) throw new Error('redis down');
            return store.values.get(key) ?? null;
          },
          set: async (key: string, _v: string, opts: { nx: boolean }) => {
            if (store.failing) throw new Error('redis down');
            if (opts.nx && store.values.has(key)) return null;
            store.values.set(key, '1');
            return 'OK';
          },
          incr: async (key: string) => {
            if (store.failing) throw new Error('redis down');
            const next = Number(store.values.get(key) ?? 0) + 1;
            store.values.set(key, next);
            return next;
          },
          expire: async () => 1,
        },
}));

import {
  allowDisplayExchangeAttempt,
  claimDisplayProof,
  disabledKey,
  displayStillAllowed,
  REVOKED_BEFORE_ALL_KEY,
  revokedBeforeKey,
} from './server';

describe('display runtime store', () => {
  beforeEach(() => {
    store.values.clear();
    store.failing = false;
    store.missing = false;
  });

  it('allows a session with no revocation records', async () => {
    expect(await displayStillAllowed('air-office', 100)).toBe(true);
  });
  it('revokes immediately per device, for all devices, and by disabling', async () => {
    store.values.set(revokedBeforeKey('air-office'), 200);
    expect(await displayStillAllowed('air-office', 199)).toBe(false);
    expect(await displayStillAllowed('air-office', 200)).toBe(true);
    expect(await displayStillAllowed('other', 199)).toBe(true);
    store.values.set(REVOKED_BEFORE_ALL_KEY, '300');
    expect(await displayStillAllowed('other', 299)).toBe(false);
    store.values.set(disabledKey('other'), '1');
    expect(await displayStillAllowed('other', 999)).toBe(false);
  });
  it('a junk revocation value denies rather than allows', async () => {
    store.values.set(revokedBeforeKey('air-office'), 'soon');
    expect(await displayStillAllowed('air-office', 999)).toBe(false);
  });
  it('fails closed when Redis errors or is missing', async () => {
    store.failing = true;
    expect(await displayStillAllowed('air-office', 100)).toBe(false);
    expect(await claimDisplayProof('air-office', 1)).toBe(false);
    expect(await allowDisplayExchangeAttempt(Date.now())).toBe(false);
    store.failing = false;
    store.missing = true;
    expect(await displayStillAllowed('air-office', 100)).toBe(false);
    expect(await claimDisplayProof('air-office', 1)).toBe(false);
    expect(await allowDisplayExchangeAttempt(Date.now())).toBe(false);
  });
  it('claims a proof exactly once per device and timestamp', async () => {
    expect(await claimDisplayProof('air-office', 5)).toBe(true);
    expect(await claimDisplayProof('air-office', 5)).toBe(false);
    expect(await claimDisplayProof('air-office', 6)).toBe(true);
    expect(await claimDisplayProof('other', 5)).toBe(true);
  });
  it('caps exchange attempts per minute', async () => {
    const t = 1_800_000_000_000;
    for (let i = 0; i < 10; i++)
      expect(await allowDisplayExchangeAttempt(t)).toBe(true);
    expect(await allowDisplayExchangeAttempt(t)).toBe(false);
    expect(await allowDisplayExchangeAttempt(t + 60_000)).toBe(true);
  });
});
