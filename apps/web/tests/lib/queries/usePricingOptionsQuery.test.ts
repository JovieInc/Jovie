import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchError } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import { pricingOptionsQueryOptions } from '@/lib/queries/usePricingOptionsQuery';

const LISTED = {
  priceId: 'price_current',
  amount: 1900,
  currency: 'usd',
  interval: 'month',
  description: 'Artist Presence',
  plan: 'pro',
};
const LOCK = {
  locked: true,
  priceVersionId: 'fixture-lock',
  lockedAt: '2026-10-29T00:00:00.000Z',
  month: {
    amountCents: 1200,
    currency: 'usd',
    interval: 'month',
    priceId: 'price_locked',
  },
  year: null,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
afterEach(() => vi.restoreAllMocks());

describe('pricingOptionsQueryOptions', () => {
  it('starts the lock read while list pricing is pending and returns only the locked price', async () => {
    let finishList!: (response: Response) => void;
    let markLockStarted!: () => void;
    const listResponse = new Promise<Response>(resolve => {
      finishList = resolve;
    });
    const lockStarted = new Promise<void>(resolve => {
      markLockStarted = resolve;
    });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async url => {
        if (String(url) === '/api/stripe/pricing-options') return listResponse;
        expect(String(url)).toBe('/api/billing/price-lock');
        markLockStarted();
        return json({ priceLock: LOCK });
      });
    const result = pricingOptionsQueryOptions.queryFn({});
    await lockStarted;
    expect(fetch).toHaveBeenCalledTimes(2);
    finishList(json({ pricingOptions: [LISTED] }));
    await expect(result).resolves.toMatchObject({
      options: [{ priceId: 'price_locked', amount: 1200 }],
      priceLock: LOCK,
    });
  });

  it.each([403, 429, 500, 503])(
    'rejects lock HTTP %i instead of returning a list price',
    async status => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async url =>
        String(url) === '/api/stripe/pricing-options'
          ? json({ pricingOptions: [LISTED] })
          : json({ error: 'unavailable' }, status)
      );
      await expect(
        pricingOptionsQueryOptions.queryFn({})
      ).rejects.toMatchObject({ status, kind: 'http' });
    }
  );

  it.each([401, 404])(
    'retains both legacy list fields when lock HTTP %i means no lock',
    async status => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async url =>
        String(url) === '/api/stripe/pricing-options'
          ? json({
              pricingOptions: [LISTED],
              options: [{ ...LISTED, priceId: 'legacy' }],
            })
          : json({ error: 'no lock' }, status)
      );
      await expect(
        pricingOptionsQueryOptions.queryFn({})
      ).resolves.toMatchObject({
        options: [LISTED, { ...LISTED, priceId: 'legacy' }],
        priceLock: null,
      });
    }
  );

  it('rejects cancellation before loading without starting either HTTP request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(
      pricingOptionsQueryOptions.queryFn({ signal: AbortSignal.abort() })
    ).rejects.toBeInstanceOf(Error);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not retry a pricing failure, so the recovery banner is not stuck behind the skeleton', () => {
    const error = new FetchError('unavailable', 503, 'unavailable');
    expect(pricingOptionsQueryOptions.retry(0, error)).toBe(false);
    expect(pricingOptionsQueryOptions.refetchOnMount).toBe(false);
    expect(pricingOptionsQueryOptions.queryKey).toEqual(
      queryKeys.billing.pricingOptions()
    );
  });
});
