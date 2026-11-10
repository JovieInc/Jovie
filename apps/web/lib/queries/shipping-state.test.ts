import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDeliverySummary } from '@/lib/ovie/shipping-state/contract';
import { unknownProjection } from '@/lib/ovie/shipping-state/project';
import { shippingStateQueryOptions } from './shipping-state';

afterEach(() => vi.restoreAllMocks());

describe('Shipping query contract', () => {
  const receipt = unknownProjection({
    sequence: 1,
    observationTimestamp: new Date().toISOString(),
    emissionTimestamp: new Date().toISOString(),
    latencyMs: 1,
    publishing: true,
    lastError: null,
  });
  const empty = emptyDeliverySummary();
  const measured = {
    ...empty,
    lanes: {
      ...empty.lanes,
      running: { state: 'measured-nonzero', value: 2 },
      slots: { state: 'measured-nonzero', value: 3 },
      alerts: ['remediation-delivery-failed'],
      failedByReason: { 'harness-failed': 61 },
      flow: null,
    },
  };
  it.each([
    ['measured', measured, measured],
    ['missing', undefined, empty],
    ['null', null, empty],
    ['invalid', { lanes: { running: 'invalid' } }, empty],
  ])(
    'preserves validated delivery or an unmeasured fallback (%s)',
    async (_, delivery, expected) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ...receipt, delivery }))
      );
      const client = new QueryClient();
      try {
        expect(
          (await client.fetchQuery(shippingStateQueryOptions)).delivery
        ).toEqual(expected);
      } finally {
        client.clear();
      }
    }
  );

  it('shares navigation prefetch with page reads without a second network request', async () => {
    const receipt = unknownProjection({
      sequence: 1,
      observationTimestamp: new Date().toISOString(),
      emissionTimestamp: new Date().toISOString(),
      latencyMs: 1,
      publishing: true,
      lastError: null,
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(receipt)));
    const client = new QueryClient();
    await client.prefetchQuery(shippingStateQueryOptions);
    const result = await client.fetchQuery(shippingStateQueryOptions);
    expect(result.observationTimestamp).toBe(receipt.observationTimestamp);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/hud/shipping-state', {
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
    client.clear();
  });

  it.each([
    [503, 'unavailable', 'Shipping observation unavailable (503)'],
    [200, '{}', 'Shipping receipt could not be validated'],
  ])(
    'rejects invalid observations (%s) rather than caching fabricated counts',
    async (status, body, message) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(body, { status })
      );
      const client = new QueryClient();
      await expect(
        client.fetchQuery(shippingStateQueryOptions)
      ).rejects.toThrow(message);
      expect(
        client.getQueryData(shippingStateQueryOptions.queryKey)
      ).toBeUndefined();
      client.clear();
    }
  );
});
