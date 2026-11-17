import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPriceLock } from './usePriceLockQuery';

afterEach(() => vi.restoreAllMocks());

const LOCK = {
  locked: true,
  priceVersionId: 'pro-2026-10-20-m12',
  lockedAt: '2026-10-29T00:00:00.000Z',
  month: {
    amountCents: 1200,
    currency: 'usd',
    interval: 'month',
    priceId: 'price_12',
  },
  year: null,
};

function respond(status: number, body: unknown = { error: 'x' }) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  );
}

describe('fetchPriceLock (real fetch helper)', () => {
  it('returns the lock on success', async () => {
    respond(200, { priceLock: LOCK });
    await expect(fetchPriceLock({})).resolves.toEqual(LOCK);
  });

  it.each([401, 404])('returns no lock for HTTP %i', async status => {
    respond(status);
    await expect(fetchPriceLock({})).resolves.toBeNull();
  });

  it.each([403, 429, 500, 503])('rejects HTTP %i', async status => {
    respond(status);
    await expect(fetchPriceLock({})).rejects.toBeInstanceOf(Error);
  });

  it('rejects a network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    await expect(fetchPriceLock({})).rejects.toBeInstanceOf(Error);
  });
});
