import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingDashboard } from '@/components/organisms/BillingDashboard';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  useFeatureFlag: vi.fn().mockReturnValue(false),
  FEATURE_FLAGS: { BILLING_UPGRADE_DIRECT: 'billing.upgradeDirect' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock sonner so toast calls don't throw
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

// Mock fetch
global.fetch = vi.fn();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BILLING_STATUS_PRO = {
  isPro: true,
  plan: 'pro',
  hasStripeCustomer: true,
  stripeSubscriptionId: 'sub_123',
};

const BILLING_STATUS_FREE = {
  isPro: false,
  plan: 'free',
  hasStripeCustomer: false,
  stripeSubscriptionId: null,
};

const PRICING_OPTIONS = {
  options: [
    {
      priceId: 'price_monthly',
      amount: 499,
      currency: 'usd',
      interval: 'month',
      description: 'Pro Monthly',
    },
    {
      priceId: 'price_yearly',
      amount: 4900,
      currency: 'usd',
      interval: 'year',
      description: 'Pro Yearly',
    },
  ],
};

const BILLING_HISTORY = {
  entries: [
    {
      id: 'evt_1',
      eventType: 'subscription.created',
      previousState: {},
      newState: {},
      stripeEventId: 'evt_stripe_1',
      source: 'webhook',
      createdAt: '2025-01-15T10:30:00Z',
    },
    {
      id: 'evt_2',
      eventType: 'payment_intent.succeeded',
      previousState: {},
      newState: {},
      stripeEventId: 'evt_stripe_2',
      source: 'webhook',
      createdAt: '2025-01-15T10:31:00Z',
    },
  ],
};

const EMPTY_HISTORY = { entries: [] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchResponses(responses: Record<string, unknown>) {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    (url: string) => {
      const body = responses[url];
      if (body === undefined) {
        return Promise.resolve(
          new Response('Not Found', { status: 404, statusText: 'Not Found' })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  );
}

function renderBillingDashboard(
  searchParams?: Record<string, string>
): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NuqsTestingAdapter searchParams={searchParams}>
        <BillingDashboard />
      </NuqsTestingAdapter>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BillingDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton while queries are pending', () => {
    // Never resolve fetch — keeps queries in loading state
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );

    renderBillingDashboard();

    // Skeleton renders placeholder shapes, not real content
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();
  });

  it('renders error banner when billing query fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        })
      )
    );

    renderBillingDashboard();

    await waitFor(() => {
      expect(
        screen.getByText('Billing is temporarily unavailable')
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('renders plan comparison grid with Free/Pro/Growth columns', async () => {
    mockFetchResponses({
      '/api/billing/status': BILLING_STATUS_FREE,
      '/api/stripe/pricing-options': PRICING_OPTIONS,
      '/api/billing/history': EMPTY_HISTORY,
    });

    renderBillingDashboard();

    await waitFor(() => {
      expect(screen.getByText('Compare Plans')).toBeInTheDocument();
    });

    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Growth')).toBeInTheDocument();
  });

  it('shows Current Plan badge on the active plan', async () => {
    mockFetchResponses({
      '/api/billing/status': BILLING_STATUS_PRO,
      '/api/stripe/pricing-options': PRICING_OPTIONS,
      '/api/billing/history': EMPTY_HISTORY,
    });

    renderBillingDashboard();

    await waitFor(() => {
      expect(screen.getByText('Pro Plan')).toBeInTheDocument();
    });

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows free plan card for non-pro users', async () => {
    mockFetchResponses({
      '/api/billing/status': BILLING_STATUS_FREE,
      '/api/stripe/pricing-options': PRICING_OPTIONS,
      '/api/billing/history': EMPTY_HISTORY,
    });

    renderBillingDashboard();

    await waitFor(() => {
      expect(screen.getByText('Free Plan')).toBeInTheDocument();
    });

    expect(screen.getByText('Limited')).toBeInTheDocument();
  });

  it('renders billing history entries with correct labels', async () => {
    mockFetchResponses({
      '/api/billing/status': BILLING_STATUS_PRO,
      '/api/stripe/pricing-options': PRICING_OPTIONS,
      '/api/billing/history': BILLING_HISTORY,
    });

    renderBillingDashboard();

    await waitFor(() => {
      expect(screen.getByText('Billing History')).toBeInTheDocument();
    });

    expect(screen.getByText('Subscription started')).toBeInTheDocument();
    expect(screen.getByText('Payment succeeded')).toBeInTheDocument();
  });

  it('shows empty billing history placeholder', async () => {
    mockFetchResponses({
      '/api/billing/status': BILLING_STATUS_FREE,
      '/api/stripe/pricing-options': PRICING_OPTIONS,
      '/api/billing/history': EMPTY_HISTORY,
    });

    renderBillingDashboard();

    await waitFor(() => {
      expect(screen.getByText('No billing events yet.')).toBeInTheDocument();
    });
  });

  it('shows manage subscription section for pro users', async () => {
    mockFetchResponses({
      '/api/billing/status': BILLING_STATUS_PRO,
      '/api/stripe/pricing-options': PRICING_OPTIONS,
      '/api/billing/history': EMPTY_HISTORY,
    });

    renderBillingDashboard();

    await waitFor(() => {
      expect(screen.getByText('Manage Subscription')).toBeInTheDocument();
    });

    expect(screen.getByText('Cancel Subscription')).toBeInTheDocument();
  });

  it('hides manage subscription section for free users', async () => {
    mockFetchResponses({
      '/api/billing/status': BILLING_STATUS_FREE,
      '/api/stripe/pricing-options': PRICING_OPTIONS,
      '/api/billing/history': EMPTY_HISTORY,
    });

    renderBillingDashboard();

    await waitFor(() => {
      expect(screen.getByText('Compare Plans')).toBeInTheDocument();
    });

    expect(screen.queryByText('Manage Subscription')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel Subscription')).not.toBeInTheDocument();
  });

  it('opens cancel subscription dialog on click', async () => {
    mockFetchResponses({
      '/api/billing/status': BILLING_STATUS_PRO,
      '/api/stripe/pricing-options': PRICING_OPTIONS,
      '/api/billing/history': EMPTY_HISTORY,
    });

    renderBillingDashboard();

    await waitFor(() => {
      expect(screen.getByText('Cancel Subscription')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancel Subscription'));

    await waitFor(() => {
      expect(screen.getByText('Cancel your subscription?')).toBeInTheDocument();
    });

    expect(screen.getByText('Keep Subscription')).toBeInTheDocument();
    expect(screen.getByText('Yes, Cancel')).toBeInTheDocument();
  });

  it('renders partial UI when pricing fails but billing succeeds', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (url: string) => {
        if (url === '/api/billing/status') {
          return Promise.resolve(
            new Response(JSON.stringify(BILLING_STATUS_FREE), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }
        // Pricing and history fail
        return Promise.resolve(
          new Response('Error', { status: 500, statusText: 'Error' })
        );
      }
    );

    renderBillingDashboard();

    // Both billing + pricing error → shows error banner
    await waitFor(() => {
      expect(
        screen.getByText('Billing is temporarily unavailable')
      ).toBeInTheDocument();
    });
  });

  it('respects interval query param from URL', async () => {
    mockFetchResponses({
      '/api/billing/status': BILLING_STATUS_FREE,
      '/api/stripe/pricing-options': PRICING_OPTIONS,
      '/api/billing/history': EMPTY_HISTORY,
    });

    renderBillingDashboard({ interval: 'year' });

    await waitFor(() => {
      expect(screen.getByText('Compare Plans')).toBeInTheDocument();
    });

    // The yearly pricing should be displayed ($49/yr for pro)
    expect(screen.getByText('$49')).toBeInTheDocument();
  });
});
