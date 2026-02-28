/**
 * Regression test: BillingDashboard must never crash when QueryClientProvider
 * is missing at the route boundary.
 *
 * This guards against route/layout provider wiring regressions. BillingDashboard
 * now self-heals by mounting a local QueryProvider when the upstream context is
 * unavailable, while still working correctly when wrapped by the app provider tree.
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

  it('renders without crashing when QueryClientProvider is missing', () => {
    expect(() =>
      render(
        <NuqsTestingAdapter>
          <BillingDashboard />
        </NuqsTestingAdapter>
      )
    ).not.toThrow();
  });
});
