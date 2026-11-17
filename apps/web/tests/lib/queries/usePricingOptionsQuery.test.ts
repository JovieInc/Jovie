import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchError } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import { pricingOptionsQueryOptions } from '@/lib/queries/usePricingOptionsQuery';
import { priceLockViewFixture } from '@/tests/fixtures/billing/price-lock';

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@/lib/queries/usePriceLockQuery');
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
const LOCK = priceLockViewFixture({
  priceVersionId: 'pro-owned-12',
  stripePriceIdMonthly: 'price_owned',
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function respond(lockStatus = 200, rawStatus = 200) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async input =>
      String(input) === '/api/stripe/pricing-options'
        ? jsonResponse(
            { pricingOptions: [LISTED], options: [LISTED] },
            rawStatus
          )
        : jsonResponse({ priceLock: LOCK }, lockStatus)
    );
}

async function queryOptions() {
  return (await import('@/lib/queries/usePricingOptionsQuery'))
    .pricingOptionsQueryOptions;
}

const NATIVE_LISTED = {
  priceId: 'price_current',
  amount: 1900,
  currency: 'usd',
  interval: 'month',
  description: 'Artist Presence',
  plan: 'pro',
};
const NATIVE_LOCK = {
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
        return json({ priceLock: NATIVE_LOCK });
      });
    const result = pricingOptionsQueryOptions.queryFn({});
    await lockStarted;
    expect(fetch).toHaveBeenCalledTimes(2);
    finishList(json({ pricingOptions: [NATIVE_LISTED] }));
    await expect(result).resolves.toMatchObject({
      options: [{ priceId: 'price_locked', amount: 1200 }],
      priceLock: NATIVE_LOCK,
    });
  });

  it.each([403, 429, 500, 503])(
    'rejects lock HTTP %i instead of returning a list price',
    async status => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async url =>
        String(url) === '/api/stripe/pricing-options'
          ? json({ pricingOptions: [NATIVE_LISTED] })
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
              pricingOptions: [NATIVE_LISTED],
              options: [{ ...NATIVE_LISTED, priceId: 'legacy' }],
            })
          : json({ error: 'no lock' }, status)
      );
      await expect(
        pricingOptionsQueryOptions.queryFn({})
      ).resolves.toMatchObject({
        options: [NATIVE_LISTED, { ...NATIVE_LISTED, priceId: 'legacy' }],
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

  it('propagates raw failure after the deferred pricing pipeline loads', async () => {
    const gate = Promise.withResolvers<void>();
    vi.doMock('@/lib/queries/usePriceLockQuery', async importOriginal => {
      await gate.promise;
      return importOriginal();
    });
    respond(200, 500);
    const options = await queryOptions();
    const result = options.queryFn({});
    gate.resolve();
    try {
      await expect(result).rejects.toMatchObject({ kind: 'http', status: 500 });
    } finally {
      await vi.dynamicImportSettled();
    }
  });

  it('defers both reads until the pricing pipeline is ready', async () => {
    const gate = Promise.withResolvers<void>();
    vi.doMock('@/lib/queries/usePriceLockQuery', async importOriginal => {
      await gate.promise;
      return importOriginal();
    });
    const fetch = respond();
    const options = await queryOptions();
    const result = options.queryFn({});
    expect(fetch).toHaveBeenCalledTimes(0);
    gate.resolve();
    await expect(result).resolves.toMatchObject({ priceLock: LOCK });
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/stripe/pricing-options');
  });

  it('rejects a module-load failure without returning list pricing', async () => {
    vi.doMock('@/lib/queries/usePriceLockQuery', () => {
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
      return once(signal, 'abort').then(() => {
        throw signal.reason;
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
    vi.doMock('@/lib/queries/usePriceLockQuery', async importOriginal => {
      await gate.promise;
      return importOriginal();
    });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_input, init) => {
        const signal = init?.signal;
        if (!signal) throw new Error('Missing request signal');
        return once(signal, 'abort').then(() => {
          throw signal.reason;
        });
      });
    const controller = new AbortController();
    const options = await queryOptions();
    const result = options.queryFn({ signal: controller.signal });
    const rejected = expect(result).rejects.toBeInstanceOf(Error);
    expect(fetch).toHaveBeenCalledTimes(0);
    controller.abort();
    gate.resolve();
    await rejected;
    await vi.dynamicImportSettled();
    expect(fetch).toHaveBeenCalledTimes(0);
  });
});
