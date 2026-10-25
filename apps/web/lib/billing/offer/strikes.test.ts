import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store, captureMessage } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  captureMessage: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/redis', () => ({
  getRedis: () => ({
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: unknown) => void store.set(k, v),
    del: async (k: string) => void store.delete(k),
    incr: async (k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, n);
      return n;
    },
  }),
}));
vi.mock('@sentry/nextjs', () => ({ captureMessage }));

import { noteOfferHash } from './hash-seen';
import { noteCheckUnavailable, UNAVAILABLE_ALERT_AT } from './strikes';

describe('unavailable strikes', () => {
  beforeEach(() => {
    store.clear();
    captureMessage.mockClear();
  });

  it('alerts on the third consecutive strike only', async () => {
    await noteCheckUnavailable(['stripe']);
    await noteCheckUnavailable(['stripe']);
    expect(captureMessage).not.toHaveBeenCalled();
    await noteCheckUnavailable(['stripe']);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(UNAVAILABLE_ALERT_AT).toBe(3);
  });

  it('a check that ran resets the count', async () => {
    await noteCheckUnavailable(['x']);
    await noteCheckUnavailable(['x']);
    await noteCheckUnavailable(null);
    await noteCheckUnavailable(['x']);
    await noteCheckUnavailable(['x']);
    expect(captureMessage).not.toHaveBeenCalled();
  });
});

describe('offer hash seen', () => {
  beforeEach(() => store.clear());

  it('reports a move only after the first sighting', async () => {
    expect(await noteOfferHash('a')).toBe(false);
    expect(await noteOfferHash('a')).toBe(false);
    expect(await noteOfferHash('b')).toBe(true);
  });
});
