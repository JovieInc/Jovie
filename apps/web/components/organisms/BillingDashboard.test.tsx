import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BillingDashboard } from './BillingDashboard';

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

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NuqsTestingAdapter>
        <BillingDashboard />
      </NuqsTestingAdapter>
    </QueryClientProvider>
  );
}

describe('BillingDashboard certificate', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('keeps the loading state axe-clean while queries are pending', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));

    const { container } = renderDashboard();

    expect(screen.queryByTestId('billing-error-state')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the error banner and refetches when Retry is pressed', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(() => json({ error: 'down' }, 500));

    const { container } = renderDashboard();

    expect(
      await screen.findByTestId('billing-error-state')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    const callsBefore = fetchMock.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });

  it('renders the offline failure as the same error banner', async () => {
    fetchMock.mockImplementation(() =>
      Promise.reject(new TypeError('Failed to fetch'))
    );

    const { container } = renderDashboard();

    expect(
      await screen.findByTestId('billing-error-state')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the stale notice for a free account with no history', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/billing/status')) {
        return json({
          isPro: false,
          plan: 'free',
          hasStripeCustomer: false,
          stripeSubscriptionId: null,
          _stale: true,
          _staleReason: 'Showing your latest saved status.',
        });
      }
      if (String(url).includes('/api/stripe/pricing-options')) {
        return json({ options: [] });
      }
      if (String(url).includes('/api/billing/history')) {
        return json({ entries: [] });
      }
      return json({ priceLock: null });
    });

    const { container } = renderDashboard();

    expect(
      await screen.findByText('Showing your latest saved status.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
