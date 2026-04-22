import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTrack = vi.fn();
const mockPage = vi.fn();

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
  page: (...args: unknown[]) => mockPage(...args),
}));

vi.mock('@/lib/entitlements/registry', () => ({
  getPlanDisplayName: (plan: string | null | undefined) =>
    plan === 'pro' ? 'Jovie Pro' : 'Jovie Free',
}));

const mockUseBillingStatusQuery = vi.fn();
vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: () => mockUseBillingStatusQuery(),
}));

vi.mock('@/components/atoms/Confetti', () => ({
  ConfettiOverlay: () => <div data-testid='confetti-overlay' />,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();

  return {
    ...actual,
    useRouter: vi.fn(() => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    })),
    usePathname: vi.fn(() => '/billing/success'),
    useSearchParams: vi.fn(() => new URLSearchParams()),
  };
});

// Use relative import to avoid @/app/ alias which resolves to app/app/
import CheckoutSuccessPage from '../../app/billing/success/page';

describe('CheckoutSuccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBillingStatusQuery.mockReturnValue({
      data: { plan: 'pro', isPro: true },
    });
  });

  it('renders "Welcome to" heading with plan name', () => {
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('heading', { name: /welcome to jovie pro/i })
    ).toBeInTheDocument();
  });

  it('shows 3 feature cards', () => {
    render(<CheckoutSuccessPage />);
    expect(screen.getByText('Release Notifications')).toBeInTheDocument();
    expect(screen.getByText('Advanced Analytics')).toBeInTheDocument();
    expect(screen.getByText('Contact Export')).toBeInTheDocument();
  });

  it('shows "Go to Dashboard" primary CTA', () => {
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('link', { name: /go to dashboard/i })
    ).toBeInTheDocument();
  });

  it('shows verification button when billingData.isPro is true', () => {
    mockUseBillingStatusQuery.mockReturnValue({
      data: { plan: 'pro', isPro: true },
    });
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('button', { name: /request verification/i })
    ).toBeInTheDocument();
  });

  it('hides verification button when billingData.isPro is false', () => {
    mockUseBillingStatusQuery.mockReturnValue({
      data: { plan: 'free', isPro: false },
    });
    render(<CheckoutSuccessPage />);
    expect(
      screen.queryByRole('button', { name: /request verification/i })
    ).not.toBeInTheDocument();
  });

  it('tracks analytics events on mount', () => {
    render(<CheckoutSuccessPage />);
    expect(mockTrack).toHaveBeenCalledWith('subscription_success', {
      flow_type: 'checkout',
      page: 'success',
    });
    expect(mockTrack).toHaveBeenCalledWith('checkout_celebration_shown', {
      planType: 'pro',
    });
    expect(mockPage).toHaveBeenCalledWith('checkout_success', {
      page_type: 'billing',
      section: 'success',
      conversion: true,
    });
  });
});
