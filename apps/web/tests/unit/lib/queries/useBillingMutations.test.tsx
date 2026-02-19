import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CheckoutResponse,
  PortalResponse,
} from '@/lib/queries/useBillingMutations';

// ---- hoisted mocks ----
const { mockFetchWithTimeout, mockCaptureError, mockHandleMutationError } =
  vi.hoisted(() => ({
    mockFetchWithTimeout: vi.fn(),
    mockCaptureError: vi.fn(),
    mockHandleMutationError: vi.fn(),
  }));

vi.mock('@/lib/queries/fetch', () => ({
  fetchWithTimeout: mockFetchWithTimeout,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/queries/mutation-utils', () => ({
  handleMutationError: mockHandleMutationError,
}));

// Use the real key factory so invalidation assertions are accurate
vi.mock('@/lib/queries/keys', () => ({
  queryKeys: {
    billing: {
      all: ['billing'] as const,
      status: () => ['billing', 'status'] as const,
      subscription: () => ['billing', 'subscription'] as const,
      invoices: () => ['billing', 'invoices'] as const,
      pricingOptions: () => ['billing', 'pricing-options'] as const,
    },
  },
}));

import {
  useCancelSubscriptionMutation,
  useCheckoutMutation,
  usePortalMutation,
} from '@/lib/queries/useBillingMutations';

// ---- shared test infrastructure ----

let queryClient: QueryClient;

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// ---- useCheckoutMutation ----

describe('useCheckoutMutation', () => {
  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call fetchWithTimeout with correct checkout endpoint and body', async () => {
    const checkoutResponse = {
      url: 'https://checkout.stripe.com/session_abc',
      sessionId: 'cs_abc',
    };
    mockFetchWithTimeout.mockResolvedValueOnce(checkoutResponse);

    const { result } = renderHook(() => useCheckoutMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ priceId: 'price_123' });
    });

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      '/api/stripe/checkout',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: 'price_123' }),
      })
    );
  });

  it('should return the checkout URL and sessionId on success', async () => {
    const checkoutResponse: CheckoutResponse = {
      url: 'https://checkout.stripe.com/session_abc',
      sessionId: 'cs_abc',
    };
    mockFetchWithTimeout.mockResolvedValueOnce(checkoutResponse);

    const { result } = renderHook(() => useCheckoutMutation(), {
      wrapper: TestWrapper,
    });

    let data: CheckoutResponse | undefined;
    await act(async () => {
      data = await result.current.mutateAsync({ priceId: 'price_123' });
    });

    expect(data).toEqual(checkoutResponse);
  });

  it('should invalidate billing queries on success', async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      url: 'https://checkout.stripe.com/session_abc',
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCheckoutMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ priceId: 'price_123' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['billing'],
      })
    );
  });

  it('should call captureError and handleMutationError on failure', async () => {
    const error = new Error('Network error');
    mockFetchWithTimeout.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useCheckoutMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ priceId: 'price_bad' });
      } catch {
        // expected
      }
    });

    expect(mockCaptureError).toHaveBeenCalledWith(
      'Checkout mutation failed',
      error,
      { route: '/api/stripe/checkout' }
    );
    expect(mockHandleMutationError).toHaveBeenCalledWith(
      error,
      'Failed to start checkout'
    );
  });

  it('should reflect isPending during inflight mutation', async () => {
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise(resolve => {
      resolvePromise = resolve;
    });
    mockFetchWithTimeout.mockReturnValueOnce(pendingPromise);

    const { result } = renderHook(() => useCheckoutMutation(), {
      wrapper: TestWrapper,
    });

    expect(result.current.isPending).toBe(false);

    act(() => {
      result.current.mutate({ priceId: 'price_123' });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    await act(async () => {
      resolvePromise!({ url: 'https://checkout.stripe.com/session_abc' });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });
});

// ---- usePortalMutation ----

describe('usePortalMutation', () => {
  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call fetchWithTimeout with correct portal endpoint', async () => {
    const portalResponse = {
      url: 'https://billing.stripe.com/portal_abc',
      sessionId: 'bps_abc',
    };
    mockFetchWithTimeout.mockResolvedValueOnce(portalResponse);

    const { result } = renderHook(() => usePortalMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      '/api/stripe/portal',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('should return the portal URL on success', async () => {
    const portalResponse: PortalResponse = {
      url: 'https://billing.stripe.com/portal_abc',
      sessionId: 'bps_abc',
    };
    mockFetchWithTimeout.mockResolvedValueOnce(portalResponse);

    const { result } = renderHook(() => usePortalMutation(), {
      wrapper: TestWrapper,
    });

    let data: PortalResponse | undefined;
    await act(async () => {
      data = await result.current.mutateAsync(undefined);
    });

    expect(data).toEqual(portalResponse);
  });

  it('should call captureError and handleMutationError on failure', async () => {
    const error = new Error('Stripe unavailable');
    mockFetchWithTimeout.mockRejectedValueOnce(error);

    const { result } = renderHook(() => usePortalMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      try {
        await result.current.mutateAsync(undefined);
      } catch {
        // expected
      }
    });

    expect(mockCaptureError).toHaveBeenCalledWith(
      'Portal mutation failed',
      error,
      { route: '/api/stripe/portal' }
    );
    expect(mockHandleMutationError).toHaveBeenCalledWith(
      error,
      'Failed to open billing portal'
    );
  });
});

// ---- useCancelSubscriptionMutation ----

describe('useCancelSubscriptionMutation', () => {
  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call fetchWithTimeout with correct cancel endpoint', async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useCancelSubscriptionMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      '/api/stripe/cancel',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('should optimistically set billing status to free during mutation', async () => {
    // Seed the billing status cache with a pro subscription via a query
    // so the data persists through cancelQueries
    queryClient.setQueryData(['billing', 'status'], {
      isPro: true,
      plan: 'pro',
    });
    // Keep a query observer alive so the data is not garbage collected
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {});

    let resolveCancel!: (value: unknown) => void;
    const pendingPromise = new Promise(resolve => {
      resolveCancel = resolve;
    });
    mockFetchWithTimeout.mockReturnValueOnce(pendingPromise);

    const { result } = renderHook(() => useCancelSubscriptionMutation(), {
      wrapper: TestWrapper,
    });

    // Fire the mutation and let onMutate run
    await act(async () => {
      result.current.mutate(undefined);
    });

    // The optimistic update should have set isPro=false, plan=free
    await waitFor(() => {
      const status = queryClient.getQueryData(['billing', 'status']) as
        | {
            isPro: boolean;
            plan: string;
          }
        | undefined;
      expect(status).toBeDefined();
      expect(status!.isPro).toBe(false);
      expect(status!.plan).toBe('free');
    });

    // Resolve the mutation to clean up
    await act(async () => {
      resolveCancel({ success: true });
    });

    unsubscribe();
  });

  it('should invalidate billing queries on successful cancellation', async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      success: true,
      status: 'canceled',
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCancelSubscriptionMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['billing'],
      })
    );
  });

  it('should rollback optimistic update on error', async () => {
    const previousData = { isPro: true, plan: 'pro' };
    queryClient.setQueryData(['billing', 'status'], previousData);

    const error = new Error('Cancel failed');
    mockFetchWithTimeout.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useCancelSubscriptionMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      try {
        await result.current.mutateAsync(undefined);
      } catch {
        // expected
      }
    });

    // The cache should be rolled back to the previous value
    await waitFor(() => {
      const status = queryClient.getQueryData(['billing', 'status']) as {
        isPro: boolean;
        plan: string;
      };
      expect(status.isPro).toBe(true);
      expect(status.plan).toBe('pro');
    });

    expect(mockCaptureError).toHaveBeenCalledWith(
      'Cancel subscription mutation failed',
      error,
      { route: '/api/stripe/cancel' }
    );
    expect(mockHandleMutationError).toHaveBeenCalledWith(
      error,
      'Failed to cancel subscription'
    );
  });

  it('should handle cancellation when no billing status is cached', async () => {
    // No pre-seeded billing status data
    mockFetchWithTimeout.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useCancelSubscriptionMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      result.current.mutate(undefined);
    });

    // Should not throw; optimistic update gracefully handles undefined
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
