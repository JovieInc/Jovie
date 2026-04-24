import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchMock,
  pageMock,
  trackMock,
  useBillingStatusQueryMock,
  useReducedMotionMock,
  searchParamsMock,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  pageMock: vi.fn(),
  trackMock: vi.fn(),
  useBillingStatusQueryMock: vi.fn(),
  useReducedMotionMock: vi.fn(() => false),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.stubGlobal('fetch', fetchMock);

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
  useReducedMotion: () => useReducedMotionMock(),
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

function mockValidatedSessionPlan(plan: string | null) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ plan }),
  });
}

describe('CheckoutSuccessPage — plan headline resolution', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(false);
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('shows "Welcome to Pro" when the checkout session validates pro', async () => {
    setSearchParams('session_id=cs_test&plan_id=pro');
    mockValidatedSessionPlan('pro');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('heading', { name: /welcome to pro/i })
    ).toBeInTheDocument();
  });

  it('shows "Welcome to Max" when the checkout session validates max', async () => {
    setSearchParams('session_id=cs_test&plan_id=max');
    mockValidatedSessionPlan('max');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('heading', { name: /welcome to max/i })
    ).toBeInTheDocument();
  });

  it('maps legacy founding -> Pro when it matches the validated session plan', async () => {
    setSearchParams('session_id=cs_test&plan_id=founding');
    mockValidatedSessionPlan('pro');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('heading', { name: /welcome to pro/i })
    ).toBeInTheDocument();
  });

  it('maps legacy growth -> Max when it matches the validated session plan', async () => {
    setSearchParams('session_id=cs_test&plan_id=growth');
    mockValidatedSessionPlan('max');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('heading', { name: /welcome to max/i })
    ).toBeInTheDocument();
  });

  it('falls back to billing data when plan_id is absent', () => {
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('heading', { name: /welcome to pro/i })
    ).toBeInTheDocument();
  });

  it('ignores an unvalidated plan_id when billing data is missing', async () => {
    setSearchParams('plan_id=max');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /welcome to your new plan/i })
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('heading', { name: /welcome to max/i })
    ).not.toBeInTheDocument();
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

  it('uses the validated checkout session plan when billing data disagrees', async () => {
    setSearchParams('session_id=cs_test&plan_id=max');
    mockValidatedSessionPlan('max');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('heading', { name: /welcome to max/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /welcome to pro/i })
    ).not.toBeInTheDocument();
  });

  it('ignores a mismatched raw plan_id and trusts the validated plan', async () => {
    setSearchParams('session_id=cs_test&plan_id=max');
    mockValidatedSessionPlan('pro');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('heading', { name: /welcome to pro/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /welcome to max/i })
    ).not.toBeInTheDocument();
  });

  it('uses the onboarding title when source=onboarding', async () => {
    setSearchParams('source=onboarding&session_id=cs_test&plan_id=pro');
    mockValidatedSessionPlan('pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('heading', {
        name: /your profile is live and upgraded/i,
      })
    ).toBeInTheDocument();
  });
});

describe('CheckoutSuccessPage — unlock tiles', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(false);
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('shows Pro tiles when the validated plan is pro', async () => {
    setSearchParams('session_id=cs_test&plan_id=pro');
    mockValidatedSessionPlan('pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByText('Release Notifications')
    ).toBeInTheDocument();
    expect(screen.getByText('Advanced Analytics')).toBeInTheDocument();
    expect(screen.getByText('Contact Export')).toBeInTheDocument();
  });

  it('shows Max tiles when the validated plan is max', async () => {
    setSearchParams('session_id=cs_test&plan_id=max');
    mockValidatedSessionPlan('max');
    mockBilling('max');
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByText('Release Plan Generation')
    ).toBeInTheDocument();
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
    fetchMock.mockReset();
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(false);
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
    fetchMock.mockReset();
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(false);
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

  it('emits checkout_celebration_shown with the validated canonical planType', async () => {
    setSearchParams('session_id=cs_test&plan_id=growth'); // legacy alias -> max
    mockValidatedSessionPlan('max');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('checkout_celebration_shown', {
        planType: 'max',
      });
    });
  });

  it('emits mount analytics once even when reduced motion resolves after first render', async () => {
    setSearchParams('plan_id=pro');
    useReducedMotionMock.mockReturnValueOnce(true).mockReturnValue(false);
    mockBilling('pro');
    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(
        trackMock.mock.calls.filter(
          ([event]) => event === 'subscription_success'
        )
      ).toHaveLength(1);
      expect(
        pageMock.mock.calls.filter(([event]) => event === 'checkout_success')
      ).toHaveLength(1);
    });
  });

  it('skips confetti when reduced motion is enabled', () => {
    setSearchParams('plan_id=pro');
    useReducedMotionMock.mockReturnValue(true);
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(screen.queryByTestId('confetti-overlay')).not.toBeInTheDocument();
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
