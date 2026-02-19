/**
 * usePlanGate Hook – Edge Cases and Negative Tests
 *
 * Tests boundary conditions, error states, and ensures the client-side
 * plan gate correctly derives entitlements from billing data.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePlanGate } from '@/lib/queries/usePlanGate';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Ensure any query-level retries resolve immediately in tests
        // (billingStatusQueryOptions has its own retry fn that overrides
        // retry:false, so we set retryDelay:0 to avoid 1s exponential delay)
        retryDelay: 0,
      },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function mockBillingResponse(data: Record<string, unknown>, status = 200) {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

describe('usePlanGate – edge cases', () => {
  it('defaults to free when plan is null in response', async () => {
    mockBillingResponse({
      isPro: false,
      plan: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });

    const { result } = renderHook(() => usePlanGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isPro).toBe(false);
    expect(result.current.plan).toBeNull();
    expect(result.current.analyticsRetentionDays).toBe(7);
    expect(result.current.contactsLimit).toBe(100);
    expect(result.current.canRemoveBranding).toBe(false);
  });

  it('handles network error gracefully', async () => {
    // Use mockRejectedValue (not Once) to handle the built-in retry in
    // billingStatusQueryOptions (retry: failureCount < 1 = one retry attempt).
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => usePlanGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should fall back to free entitlements
    expect(result.current.isError).toBe(true);
    expect(result.current.isPro).toBe(false);
    expect(result.current.contactsLimit).toBe(100);
  });

  it('handles 500 server error gracefully', async () => {
    // Use mockResolvedValue (not Once) to handle the built-in retry in
    // billingStatusQueryOptions (retry: failureCount < 1 = one retry attempt).
    mockFetch.mockResolvedValue(
      new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      })
    );

    const { result } = renderHook(() => usePlanGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.isPro).toBe(false);
    expect(result.current.analyticsRetentionDays).toBe(7);
  });

  it('pro user with isPro=true but no plan string → free-tier entitlements from registry', async () => {
    mockBillingResponse({
      isPro: true,
      plan: null,
      stripeCustomerId: 'cus_x',
      stripeSubscriptionId: 'sub_x',
    });

    const { result } = renderHook(() => usePlanGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // isPro flag is still true from billing response
    expect(result.current.isPro).toBe(true);
    // But entitlements are derived from plan string via registry — null plan = free
    expect(result.current.canRemoveBranding).toBe(false);
    expect(result.current.canExportContacts).toBe(false);
    expect(result.current.canAccessAdvancedAnalytics).toBe(false);
    expect(result.current.analyticsRetentionDays).toBe(7);
    expect(result.current.contactsLimit).toBe(100);
  });

  it('growth user gets 365-day retention and unlimited contacts', async () => {
    mockBillingResponse({
      isPro: true,
      plan: 'growth',
      stripeCustomerId: 'cus_g',
      stripeSubscriptionId: 'sub_g',
    });

    const { result } = renderHook(() => usePlanGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.analyticsRetentionDays).toBe(365);
    expect(result.current.contactsLimit).toBeNull();
    expect(result.current.canRemoveBranding).toBe(true);
  });

  it('unknown plan string gets free retention and contact limits', async () => {
    mockBillingResponse({
      isPro: false,
      plan: 'enterprise',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });

    const { result } = renderHook(() => usePlanGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // getRetentionDays / getContactsLimit only recognize 'pro' and 'growth'
    expect(result.current.analyticsRetentionDays).toBe(7);
    expect(result.current.contactsLimit).toBe(100);
  });
});

describe('usePlanGate – feature consistency', () => {
  it('all boolean features follow isPro flag for pro user', async () => {
    mockBillingResponse({
      isPro: true,
      plan: 'pro',
      stripeCustomerId: 'cus_p',
      stripeSubscriptionId: 'sub_p',
    });

    const { result } = renderHook(() => usePlanGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // All boolean features should be true when isPro=true
    expect(result.current.canRemoveBranding).toBe(true);
    expect(result.current.canAccessAdPixels).toBe(true);
    expect(result.current.canFilterSelfFromAnalytics).toBe(true);
    expect(result.current.canAccessAdvancedAnalytics).toBe(true);
    expect(result.current.canExportContacts).toBe(true);
  });

  it('all boolean features are false for free user', async () => {
    mockBillingResponse({
      isPro: false,
      plan: 'free',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });

    const { result } = renderHook(() => usePlanGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canRemoveBranding).toBe(false);
    expect(result.current.canAccessAdPixels).toBe(false);
    expect(result.current.canFilterSelfFromAnalytics).toBe(false);
    expect(result.current.canAccessAdvancedAnalytics).toBe(false);
    expect(result.current.canExportContacts).toBe(false);
  });

  it('error state defaults all features to free tier', async () => {
    // Use mockResolvedValue (not Once) to handle the built-in retry in
    // billingStatusQueryOptions (retry: failureCount < 1 = one retry attempt).
    mockFetch.mockResolvedValue(new Response('Bad Gateway', { status: 502 }));

    const { result } = renderHook(() => usePlanGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.canRemoveBranding).toBe(false);
    expect(result.current.canAccessAdPixels).toBe(false);
    expect(result.current.canExportContacts).toBe(false);
    expect(result.current.analyticsRetentionDays).toBe(7);
    expect(result.current.contactsLimit).toBe(100);
  });
});
