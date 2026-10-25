import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  failing: false,
  missing: false,
  expireFails: false,
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
          expire: async () => {
            if (store.expireFails) throw new Error('expire failed');
            return 1;
          },
        },
}));

import {
  allowDisplayExchangeAttempt,
  claimDisplayProof,
  clientAddress,
  disabledKey,
  displayStillAllowed,
  REVOKED_BEFORE_ALL_KEY,
  revokedBeforeKey,
} from './server';

const T = 1_800_000_000_000;
const attempt = (
  address: string,
  deviceHint: unknown = 'air-office',
  nowMs = T
) => allowDisplayExchangeAttempt({ nowMs, address, deviceHint });

describe('display runtime store', () => {
  beforeEach(() => {
    store.values.clear();
    store.failing = false;
    store.missing = false;
    store.expireFails = false;
  });

  it('allows a session with no revocation records', async () => {
    expect(await displayStillAllowed('air-office', 100)).toBe('ok');
  });
  it('revokes immediately per device, for all devices, and by disabling', async () => {
    store.values.set(revokedBeforeKey('air-office'), 200);
    expect(await displayStillAllowed('air-office', 199)).toBe('denied');
    expect(await displayStillAllowed('air-office', 200)).toBe('ok');
    expect(await displayStillAllowed('other', 199)).toBe('ok');
    store.values.set(REVOKED_BEFORE_ALL_KEY, '300');
    expect(await displayStillAllowed('other', 299)).toBe('denied');
    store.values.set(disabledKey('other'), '1');
    expect(await displayStillAllowed('other', 999)).toBe('denied');
  });
  it('a junk revocation value denies rather than allows', async () => {
    store.values.set(revokedBeforeKey('air-office'), 'soon');
    expect(await displayStillAllowed('air-office', 999)).toBe('denied');
  });
  it('reports unavailable (never ok) when Redis errors or is missing', async () => {
    store.failing = true;
    expect(await displayStillAllowed('air-office', 100)).toBe('unavailable');
    expect(await claimDisplayProof('air-office', 1)).toBe('unavailable');
    expect(await attempt('1.1.1.1')).toBe('unavailable');
    store.failing = false;
    store.missing = true;
    expect(await displayStillAllowed('air-office', 100)).toBe('unavailable');
    expect(await claimDisplayProof('air-office', 1)).toBe('unavailable');
    expect(await attempt('1.1.1.1')).toBe('unavailable');
  });
  it('claims a proof exactly once per device and timestamp', async () => {
    expect(await claimDisplayProof('air-office', 5)).toBe('ok');
    expect(await claimDisplayProof('air-office', 5)).toBe('denied');
    expect(await claimDisplayProof('air-office', 6)).toBe('ok');
    expect(await claimDisplayProof('other', 5)).toBe('ok');
  });

  describe('exchange rate limit', () => {
    it('caps attempts per minute for one address and device', async () => {
      for (let i = 0; i < 10; i++) expect(await attempt('1.1.1.1')).toBe('ok');
      expect(await attempt('1.1.1.1')).toBe('denied');
      expect(await attempt('1.1.1.1', 'air-office', T + 60_000)).toBe('ok');
    });
    it('junk from another address cannot lock the Air out', async () => {
      for (let i = 0; i < 50; i++) await attempt('6.6.6.6');
      expect(await attempt('6.6.6.6')).toBe('denied');
      expect(await attempt('9.9.9.9')).toBe('ok');
    });
    it("junk naming another device (or none) does not spend the Air's budget from the same address", async () => {
      for (let i = 0; i < 50; i++) await attempt('9.9.9.9', 'not-the-air');
      for (let i = 0; i < 50; i++) await attempt('9.9.9.9', 42);
      expect(await attempt('9.9.9.9', 'air-office')).toBe('ok');
    });
    it('stores only a hash of the address', async () => {
      await attempt('203.0.113.7');
      expect([...store.values.keys()].join()).not.toContain('203.0.113.7');
    });
    it('an expire failure does not fail the request', async () => {
      store.expireFails = true;
      expect(await attempt('1.1.1.1')).toBe('ok');
    });
  });
});

describe('clientAddress', () => {
  it('prefers the platform header, then real-ip, then the first forwarded hop', () => {
    expect(
      clientAddress(
        new Headers({
          'x-vercel-forwarded-for': '1.2.3.4',
          'x-real-ip': '5.6.7.8',
        })
      )
    ).toBe('1.2.3.4');
    expect(clientAddress(new Headers({ 'x-real-ip': '5.6.7.8' }))).toBe(
      '5.6.7.8'
    );
    expect(
      clientAddress(new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))
    ).toBe('9.9.9.9');
    expect(clientAddress(new Headers())).toBe('unknown');
  });
});
