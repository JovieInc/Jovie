import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries/keys';
import {
  type CheckoutResponse,
  type PortalResponse,
  useCheckoutMutation,
  usePortalMutation,
} from '@/lib/queries/useBillingMutations';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock sonner toast - must use factory function pattern for hoisting
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock Sentry (used by handleMutationError)
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// Import the mocked modules for assertions
import { toast } from 'sonner';

describe('useBillingMutations', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
  });

  describe('useCheckoutMutation', () => {
    const mockCheckoutResponse: CheckoutResponse = {
      url: 'https://checkout.stripe.com/session123',
      sessionId: 'cs_test_123',
    };

    it('creates checkout session and returns URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCheckoutResponse),
      });

      const { result } = renderHook(() => useCheckoutMutation(), { wrapper });

      result.current.mutate({ priceId: 'price_pro_monthly' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockCheckoutResponse);
    });

    it('sends correct payload to checkout endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCheckoutResponse),
      });

      const { result } = renderHook(() => useCheckoutMutation(), { wrapper });

      result.current.mutate({ priceId: 'price_pro_yearly' });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/stripe/checkout',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify({ priceId: 'price_pro_yearly' }),
          })
        );
      });
    });

    it('does NOT automatically redirect (allows analytics tracking)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCheckoutResponse),
      });

      const { result } = renderHook(() => useCheckoutMutation(), { wrapper });

      result.current.mutate({ priceId: 'price_pro_monthly' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify we get the URL back (not auto-redirected)
      expect(result.current.data?.url).toBe(
        'https://checkout.stripe.com/session123'
      );
    });

    it('handles alreadySubscribed response', async () => {
      const alreadySubscribedResponse: CheckoutResponse = {
        url: '',
        alreadySubscribed: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(alreadySubscribedResponse),
      });

      const { result } = renderHook(() => useCheckoutMutation(), { wrapper });

      result.current.mutate({ priceId: 'price_pro_monthly' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.alreadySubscribed).toBe(true);
    });

    it('calls invalidateQueries for billing on success', async () => {
      // Spy on queryClient.invalidateQueries
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCheckoutResponse),
      });

      const { result } = renderHook(() => useCheckoutMutation(), { wrapper });

      result.current.mutate({ priceId: 'price_pro_monthly' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify invalidateQueries was called with billing.all
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.billing.all,
      });
    });

    it('shows error toast on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() => useCheckoutMutation(), { wrapper });

      result.current.mutate({ priceId: 'price_pro_monthly' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledWith(
        'Something went wrong. Please try again.'
      );
    });

    it('shows specific error for rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const { result } = renderHook(() => useCheckoutMutation(), { wrapper });

      result.current.mutate({ priceId: 'price_pro_monthly' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledWith(
        'Too many requests. Please try again later.'
      );
    });

    it('shows specific error for unauthorized', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const { result } = renderHook(() => useCheckoutMutation(), { wrapper });

      result.current.mutate({ priceId: 'price_pro_monthly' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledWith('Please sign in to continue');
    });
  });

  describe('usePortalMutation', () => {
    const mockPortalResponse: PortalResponse = {
      url: 'https://billing.stripe.com/portal/session456',
      sessionId: 'bps_test_456',
    };

    it('creates portal session and returns URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPortalResponse),
      });

      const { result } = renderHook(() => usePortalMutation(), { wrapper });

      result.current.mutate(undefined);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockPortalResponse);
    });

    it('sends POST request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPortalResponse),
      });

      const { result } = renderHook(() => usePortalMutation(), { wrapper });

      result.current.mutate(undefined);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/stripe/portal',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });
    });

    it('shows error toast on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      const { result } = renderHook(() => usePortalMutation(), { wrapper });

      result.current.mutate(undefined);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledWith(
        'You do not have permission to do this'
      );
    });
  });

  describe('integration scenarios', () => {
    it('checkout mutation provides data needed for redirect flow', async () => {
      const checkoutResponse: CheckoutResponse = {
        url: 'https://checkout.stripe.com/pay?session=abc123',
        sessionId: 'cs_abc123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(checkoutResponse),
      });

      const { result } = renderHook(() => useCheckoutMutation(), { wrapper });

      const onSuccess = vi.fn();

      result.current.mutate(
        { priceId: 'price_pro_monthly' },
        {
          onSuccess: data => {
            onSuccess(data);
          },
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('checkout.stripe.com'),
          sessionId: expect.any(String),
        })
      );
    });
  });
});
