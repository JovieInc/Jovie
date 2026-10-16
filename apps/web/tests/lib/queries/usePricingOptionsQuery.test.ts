import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchError } from '@/lib/queries/fetch';
import {
  pricingOptionsQueryOptions,
  usePricingOptionsQuery,
} from '@/lib/queries/usePricingOptionsQuery';

afterEach(() => vi.unstubAllGlobals());

describe('pricingOptionsQueryOptions', () => {
  it('does not retry a pricing failure, so the recovery banner is not stuck behind the skeleton', () => {
    const error = new FetchError('unavailable', 503, 'unavailable');
    expect(pricingOptionsQueryOptions.retry(0, error)).toBe(false);
    expect(pricingOptionsQueryOptions.refetchOnMount).toBe(false);
  });

  it('exposes a failed pricing request immediately and lets the caller retry successfully', async () => {
    const option = {
      priceId: 'price_pro',
      amount: 2900,
      currency: 'usd',
      interval: 'month',
      description: 'Pro',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ pricingOptions: [option] }))
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 3, retryDelay: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const view = renderHook(() => usePricingOptionsQuery(), { wrapper });

    try {
      await waitFor(() => expect(view.result.current.isError).toBe(true));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await act(async () => {
        await view.result.current.refetch();
      });
      await waitFor(() =>
        expect(view.result.current.data?.options).toEqual([option])
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(view.result.current.isSuccess).toBe(true);
    } finally {
      view.unmount();
      client.clear();
    }
  });
});
