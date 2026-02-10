import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePlanGate } from '@/lib/queries/usePlanGate';

// Mock the billing status fetch
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function mockBillingResponse(data: {
  isPro: boolean;
  plan: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

describe('usePlanGate', () => {
  it('returns free entitlements for a free user', async () => {
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

    expect(result.current.isPro).toBe(false);
    expect(result.current.plan).toBe('free');
    expect(result.current.canRemoveBranding).toBe(false);
    expect(result.current.canAccessAdPixels).toBe(false);
    expect(result.current.canFilterSelfFromAnalytics).toBe(false);
    expect(result.current.canAccessAdvancedAnalytics).toBe(false);
    expect(result.current.canExportContacts).toBe(false);
    expect(result.current.analyticsRetentionDays).toBe(7);
    expect(result.current.contactsLimit).toBe(100);
    expect(result.current.isError).toBe(false);
  });

  it('returns pro entitlements for a pro user', async () => {
    mockBillingResponse({
      isPro: true,
      plan: 'pro',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
    });

    const { result } = renderHook(() => usePlanGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isPro).toBe(true);
    expect(result.current.plan).toBe('pro');
    expect(result.current.canRemoveBranding).toBe(true);
    expect(result.current.canAccessAdPixels).toBe(true);
    expect(result.current.canFilterSelfFromAnalytics).toBe(true);
    expect(result.current.canAccessAdvancedAnalytics).toBe(true);
    expect(result.current.canExportContacts).toBe(true);
    expect(result.current.analyticsRetentionDays).toBe(90);
    expect(result.current.contactsLimit).toBeNull();
  });

  it('returns growth entitlements for a growth user', async () => {
    mockBillingResponse({
      isPro: true,
      plan: 'growth',
    });

    const { result } = renderHook(() => usePlanGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.analyticsRetentionDays).toBe(365);
    expect(result.current.contactsLimit).toBeNull();
  });

  it('exposes isError when billing fetch fails', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Service Unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      })
    );

    const { result } = renderHook(() => usePlanGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    // Should default to free limits when error occurs
    expect(result.current.isPro).toBe(false);
    expect(result.current.analyticsRetentionDays).toBe(7);
    expect(result.current.contactsLimit).toBe(100);
  });
});
