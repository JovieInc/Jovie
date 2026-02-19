import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries/keys';
import {
  useBillingStatusQuery,
  useIsPro,
} from '@/lib/queries/useBillingStatusQuery';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useBillingStatusQuery', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
          // Ensure any query-level retries resolve immediately in tests
          // (billingStatusQueryOptions has its own retry fn that overrides
          // retry:false, so we set retryDelay:0 to avoid 1s exponential delay)
          retryDelay: 0,
        },
      },
    });
  });

  describe('useBillingStatusQuery hook', () => {
    it('fetches billing status successfully', async () => {
      const mockResponse = {
        isPro: true,
        plan: 'pro_monthly',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_456',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useBillingStatusQuery(), { wrapper });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual({
        isPro: true,
        plan: 'pro_monthly',
        hasStripeCustomer: true,
        stripeSubscriptionId: 'sub_456',
      });
    });

    it('normalizes response with missing fields', async () => {
      // API may return partial data
      const mockResponse = {
        isPro: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useBillingStatusQuery(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual({
        isPro: false,
        plan: null,
        hasStripeCustomer: false,
        stripeSubscriptionId: null,
      });
    });

    it('normalizes empty response to free tier', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { result } = renderHook(() => useBillingStatusQuery(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual({
        isPro: false,
        plan: null,
        hasStripeCustomer: false,
        stripeSubscriptionId: null,
      });
    });

    it('handles fetch error', async () => {
      // Use mockResolvedValue (not Once) to handle the built-in retry in
      // billingStatusQueryOptions (retry: failureCount < 1 = one retry attempt).
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const { result } = renderHook(() => useBillingStatusQuery(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });

    it('fetches from correct endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ isPro: true }),
      });

      renderHook(() => useBillingStatusQuery(), { wrapper });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/billing/status',
          expect.any(Object)
        );
      });
    });

    it('uses correct query key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ isPro: false }),
      });

      renderHook(() => useBillingStatusQuery(), { wrapper });

      await waitFor(() => {
        expect(
          queryClient.getQueryState(queryKeys.billing.status())
        ).toBeDefined();
      });
    });

    it('uses FREQUENT_CACHE (1 min stale time)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ isPro: false }),
      });

      const { result, rerender } = renderHook(() => useBillingStatusQuery(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const firstCallCount = mockFetch.mock.calls.length;

      // Rerender - should use cached data within 1 min
      rerender();

      await new Promise(r => setTimeout(r, 10));

      expect(mockFetch.mock.calls.length).toBe(firstCallCount);
    });
  });

  describe('useIsPro hook', () => {
    it('returns isPro value using select', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            isPro: true,
            plan: 'pro_yearly',
            stripeCustomerId: 'cus_123',
          }),
      });

      const { result } = renderHook(() => useIsPro(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // useIsPro selects only isPro from the data
      expect(result.current.data).toBe(true);
    });

    it('returns false for free users', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ isPro: false }),
      });

      const { result } = renderHook(() => useIsPro(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBe(false);
    });

    it('shares cache with useBillingStatusQuery', async () => {
      const mockResponse = {
        isPro: true,
        plan: 'pro_monthly',
        stripeCustomerId: 'cus_123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // First call with useBillingStatusQuery
      const { result: billingResult } = renderHook(
        () => useBillingStatusQuery(),
        { wrapper }
      );

      await waitFor(() => {
        expect(billingResult.current.isSuccess).toBe(true);
      });

      // useIsPro should reuse the same cache
      const { result: isProResult } = renderHook(() => useIsPro(), { wrapper });

      await waitFor(() => {
        expect(isProResult.current.isSuccess).toBe(true);
      });

      // Should only have made one fetch call
      expect(mockFetch.mock.calls.length).toBe(1);
      expect(isProResult.current.data).toBe(true);
    });

    it('handles error state', async () => {
      // Use mockResolvedValue (not Once) to handle the built-in retry in
      // billingStatusQueryOptions (retry: failureCount < 1 = one retry attempt).
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() => useIsPro(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe('data transformation', () => {
    it('converts stripeCustomerId to hasStripeCustomer boolean', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            isPro: false,
            stripeCustomerId: 'cus_abc123',
          }),
      });

      const { result } = renderHook(() => useBillingStatusQuery(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.hasStripeCustomer).toBe(true);
    });

    it('handles null stripeCustomerId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            isPro: false,
            stripeCustomerId: null,
          }),
      });

      const { result } = renderHook(() => useBillingStatusQuery(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.hasStripeCustomer).toBe(false);
    });

    it('coerces isPro to boolean', async () => {
      // Edge case: API might return undefined
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            plan: 'free',
          }),
      });

      const { result } = renderHook(() => useBillingStatusQuery(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.isPro).toBe(false);
    });
  });
});
