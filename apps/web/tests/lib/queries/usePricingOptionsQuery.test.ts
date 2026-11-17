import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchError } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import { pricingOptionsQueryOptions } from '@/lib/queries/usePricingOptionsQuery';

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@/lib/queries/price-lock-pricing');
  vi.resetModules();
});

const LISTED = {
  priceId: 'price_list',
  amount: 1900,
  currency: 'usd',
  interval: 'month',
  description: 'Artist Presence',
  plan: 'pro',
};
const LOCK = {
  locked: true,
  priceVersionId: 'pro-owned-12',
  lockedAt: '2026-10-29T00:00:00.000Z',
  month: {
    amountCents: 1200,
    currency: 'usd',
    interval: 'month',
    priceId: 'price_owned',
  },
  year: null,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function respond(lockStatus = 200) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async input =>
      String(input) === '/api/stripe/pricing-options'
        ? jsonResponse({ pricingOptions: [LISTED], options: [LISTED] })
        : jsonResponse({ priceLock: LOCK }, lockStatus)
    );
}

async function queryOptions() {
  return (await import('@/lib/queries/usePricingOptionsQuery'))
    .pricingOptionsQueryOptions;
}

describe('pricingOptionsQueryOptions', () => {
  it('does not retry a pricing failure, so the recovery banner is not stuck behind the skeleton', () => {
    const error = new FetchError('unavailable', 503, 'unavailable');
    expect(pricingOptionsQueryOptions.retry(0, error)).toBe(false);
    expect(pricingOptionsQueryOptions.refetchOnMount).toBe(false);
    expect(pricingOptionsQueryOptions.queryKey).toEqual(
      queryKeys.billing.pricingOptions()
    );
  });

  it('applies the owned lock and deduplicates both pricing aliases', async () => {
    respond();
    const options = await queryOptions();
    await expect(options.queryFn({})).resolves.toEqual({
      options: [{ ...LISTED, priceId: 'price_owned', amount: 1200 }],
      priceLock: LOCK,
    });
  });

  it('rejects a failed lock read instead of returning the list price', async () => {
    respond(500);
    const options = await queryOptions();
    await expect(options.queryFn({})).rejects.toMatchObject({
      kind: 'http',
      status: 500,
    });
  });

  it('starts the raw read while lock tooling is still loading', async () => {
    const gate = Promise.withResolvers<void>();
    vi.doMock('@/lib/queries/price-lock-pricing', async importOriginal => {
      await gate.promise;
      return importOriginal();
    });
    const fetch = respond();
    const options = await queryOptions();
    const result = options.queryFn({});
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/stripe/pricing-options');
    gate.resolve();
    await expect(result).resolves.toMatchObject({ priceLock: LOCK });
  });

  it('rejects a module-load failure without returning list pricing', async () => {
    vi.doMock('@/lib/queries/price-lock-pricing', () => {
      throw new Error('lock tooling unavailable');
    });
    respond();
    const options = await queryOptions();
    await expect(options.queryFn({})).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'lock tooling unavailable' }),
    });
  });

  it('cancels both in-flight reads with the caller signal', async () => {
    const signals: AbortSignal[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      const signal = init?.signal;
      if (!signal) throw new Error('Missing request signal');
      signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true }
        );
      });
    });
    const controller = new AbortController();
    const options = await queryOptions();
    const result = options.queryFn({ signal: controller.signal });
    const rejected = expect(result).rejects.toBeInstanceOf(Error);
    await vi.waitFor(() => expect(signals).toHaveLength(2));
    controller.abort();
    await rejected;
    expect(signals.every(signal => signal.aborted)).toBe(true);
  });

  it('fails closed when canceled before the lock module loads', async () => {
    const gate = Promise.withResolvers<void>();
    vi.doMock('@/lib/queries/price-lock-pricing', async importOriginal => {
      await gate.promise;
      return importOriginal();
    });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_input, init) => {
        const signal = init?.signal;
        if (!signal) throw new Error('Missing request signal');
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        });
      });
    const controller = new AbortController();
    const options = await queryOptions();
    const result = options.queryFn({ signal: controller.signal });
    const rejected = expect(result).rejects.toBeInstanceOf(Error);
    expect(fetch).toHaveBeenCalledTimes(1);
    controller.abort();
    gate.resolve();
    await rejected;
    await vi.dynamicImportSettled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
