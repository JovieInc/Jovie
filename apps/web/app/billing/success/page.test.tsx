import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pageMock, trackMock, useBillingStatusQueryMock, searchParamsMock } =
  vi.hoisted(() => ({
    pageMock: vi.fn(),
    trackMock: vi.fn(),
    useBillingStatusQueryMock: vi.fn(),
    searchParamsMock: vi.fn(() => new URLSearchParams()),
  }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/atoms/Confetti', () => ({
  ConfettiOverlay: (props: { readonly viewport?: boolean }) => (
    <div
      data-testid='confetti-overlay'
      data-viewport={props.viewport ? 'true' : 'false'}
    />
  ),
}));

vi.mock('@/lib/analytics', () => ({
  page: pageMock,
  track: trackMock,
}));

vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: useBillingStatusQueryMock,
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

import CheckoutSuccessPage from './page';

function setSearchParams(query: string) {
  searchParamsMock.mockReturnValue(new URLSearchParams(query));
}

function mockBilling(
  plan: string | null,
  opts: { readonly isPro?: boolean } = {}
) {
  const derivedIsPro = plan === 'pro' || plan === 'max' || plan === 'trial';
  useBillingStatusQueryMock.mockReturnValue({
    data: {
      isPro: opts.isPro ?? derivedIsPro,
      plan,
    },
  });
}

describe('CheckoutSuccessPage — plan headline resolution', () => {
  beforeEach(() => {
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('shows "Welcome to Pro" when session plan_id is pro', () => {
    setSearchParams('plan_id=pro');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('heading', { name: /welcome to pro/i })
    ).toBeInTheDocument();
  });

  it('shows "Welcome to Max" when session plan_id is max', () => {
    setSearchParams('plan_id=max');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('heading', { name: /welcome to max/i })
    ).toBeInTheDocument();
  });

  it('maps legacy founding -> Pro', () => {
    setSearchParams('plan_id=founding');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('heading', { name: /welcome to pro/i })
    ).toBeInTheDocument();
  });

  it('maps legacy growth -> Max', () => {
    setSearchParams('plan_id=growth');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('heading', { name: /welcome to max/i })
    ).toBeInTheDocument();
  });

  it('falls back to billing data when plan_id is absent', () => {
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('heading', { name: /welcome to pro/i })
    ).toBeInTheDocument();
  });

  it('falls back to generic "Welcome to your new plan!" when plan_id is invalid AND billing is missing', () => {
    setSearchParams('plan_id=not-a-real-plan');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('heading', { name: /welcome to your new plan/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /welcome to free/i })
    ).not.toBeInTheDocument();
  });

  it('never shows "Welcome to Free" even when billing reports free', () => {
    mockBilling('free', { isPro: false });
    render(<CheckoutSuccessPage />);
    expect(
      screen.queryByRole('heading', { name: /welcome to free/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /welcome to your new plan/i })
    ).toBeInTheDocument();
  });

  it('prefers Stripe session plan_id over billing data when they disagree', () => {
    setSearchParams('plan_id=max');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('heading', { name: /welcome to max/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /welcome to pro/i })
    ).not.toBeInTheDocument();
  });

  it('uses the onboarding title when source=onboarding', () => {
    setSearchParams('source=onboarding&plan_id=pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('heading', {
        name: /your profile is live and upgraded/i,
      })
    ).toBeInTheDocument();
  });
});

describe('CheckoutSuccessPage — unlock tiles', () => {
  beforeEach(() => {
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('shows Pro tiles when plan is pro', () => {
    setSearchParams('plan_id=pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(screen.getByText('Release Notifications')).toBeInTheDocument();
    expect(screen.getByText('Advanced Analytics')).toBeInTheDocument();
    expect(screen.getByText('Contact Export')).toBeInTheDocument();
  });

  it('shows Max tiles when plan is max', () => {
    setSearchParams('plan_id=max');
    mockBilling('max');
    render(<CheckoutSuccessPage />);
    expect(screen.getByText('Release Plan Generation')).toBeInTheDocument();
    expect(screen.getByText('Metadata Submission Agent')).toBeInTheDocument();
  });

  it('shows generic tiles when plan cannot be resolved', () => {
    setSearchParams('plan_id=not-a-real-plan');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(screen.getByText('Your plan is active')).toBeInTheDocument();
  });
});

describe('CheckoutSuccessPage — CTAs and verification', () => {
  beforeEach(() => {
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('primary CTA routes to /app/chat', () => {
    setSearchParams('plan_id=pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(screen.getByRole('link', { name: /go to chat/i })).toHaveAttribute(
      'href',
      '/app/chat'
    );
  });

  it('secondary CTA routes to /app/dashboard/releases', () => {
    setSearchParams('plan_id=pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('link', { name: /view your releases/i })
    ).toHaveAttribute('href', '/app/dashboard/releases');
  });

  it('hides the secondary CTA on onboarding flow and shows "Explore your dashboard"', () => {
    setSearchParams('source=onboarding&plan_id=pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('link', { name: /explore your dashboard/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /view your releases/i })
    ).not.toBeInTheDocument();
  });

  it('shows verification button when isPro is true', () => {
    setSearchParams('plan_id=pro');
    mockBilling('pro', { isPro: true });
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('button', { name: /request verification/i })
    ).toBeInTheDocument();
  });

  it('hides verification button when isPro is false', () => {
    setSearchParams('plan_id=pro');
    mockBilling('free', { isPro: false });
    render(<CheckoutSuccessPage />);
    expect(
      screen.queryByRole('button', { name: /request verification/i })
    ).not.toBeInTheDocument();
  });
});

describe('CheckoutSuccessPage — analytics and shell', () => {
  beforeEach(() => {
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('emits subscription_success + checkout_success on mount', () => {
    setSearchParams('plan_id=pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(trackMock).toHaveBeenCalledWith(
      'subscription_success',
      expect.any(Object)
    );
    expect(pageMock).toHaveBeenCalledWith(
      'checkout_success',
      expect.any(Object)
    );
  });

  it('emits checkout_celebration_shown with resolved canonical planType', () => {
    setSearchParams('plan_id=growth'); // legacy alias -> max
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(trackMock).toHaveBeenCalledWith('checkout_celebration_shown', {
      planType: 'max',
    });
  });

  it('keeps the standalone shell vertically scrollable with confetti', () => {
    setSearchParams('plan_id=pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    const pageShell = screen.getByRole('main');
    expect(pageShell.className).toContain('overflow-y-auto');
    expect(pageShell.className).not.toContain('overflow-hidden');
    expect(screen.getByTestId('confetti-overlay')).toHaveAttribute(
      'data-viewport',
      'true'
    );
  });
});
