/**
 * Regression test: BillingDashboard requires QueryClientProvider.
 *
 * This test guards against the production bug where billing/layout.tsx
 * passed `skipCoreProviders` to ClientProviders, which stripped
 * QueryProvider from the tree. BillingDashboard uses TanStack Query
 * hooks that crash without QueryClientProvider.
 *
 * Introduced in commit 78fd6d6a9 (Jan 22).
 * Fixed by removing skipCoreProviders from billing layout.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { describe, expect, it, vi } from 'vitest';
import { BillingDashboard } from '@/components/organisms/BillingDashboard';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  useFeatureFlag: vi.fn().mockReturnValue(false),
  FEATURE_FLAGS: { BILLING_UPGRADE_DIRECT: 'billing.upgradeDirect' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
}));

global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

describe('BillingDashboard provider requirements', () => {
  it('renders without crashing when wrapped in QueryClientProvider', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    expect(() =>
      render(
        <QueryClientProvider client={queryClient}>
          <NuqsTestingAdapter>
            <BillingDashboard />
          </NuqsTestingAdapter>
        </QueryClientProvider>
      )
    ).not.toThrow();
  });

  it('throws when rendered without QueryClientProvider', () => {
    // Suppress React error boundary console noise
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      render(
        <NuqsTestingAdapter>
          <BillingDashboard />
        </NuqsTestingAdapter>
      )
    ).toThrow();

    consoleSpy.mockRestore();
  });
});
