import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchMock,
  pageMock,
  trackMock,
  useBillingStatusQueryMock,
  searchParamsMock,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  pageMock: vi.fn(),
  trackMock: vi.fn(),
  useBillingStatusQueryMock: vi.fn(),
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

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { readonly children?: string }) => (
    <button type='button'>{children}</button>
  ),
}));

vi.mock('@/lib/analytics', () => ({
  page: pageMock,
  track: trackMock,
}));

vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: useBillingStatusQueryMock,
}));

import CheckoutSuccessPage from './page';

function setSearchParams(query: string) {
  searchParamsMock.mockReturnValue(new URLSearchParams(query));
}

function mockBilling(
  plan: string | null,
  opts: { readonly isPro?: boolean; readonly isLoading?: boolean } = {}
) {
  const derivedIsPro = plan === 'pro' || plan === 'max' || plan === 'trial';
  const isLoading = opts.isLoading ?? false;
  useBillingStatusQueryMock.mockReturnValue({
    data: isLoading
      ? undefined
      : {
          isPro: opts.isPro ?? derivedIsPro,
          plan,
        },
    isLoading,
    isFetched: !isLoading,
    error: null,
  });
}

function mockValidatedSessionPlan(
  plan: string | null,
  ok = true,
  extras: Record<string, unknown> = {}
) {
  fetchMock.mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: vi.fn().mockResolvedValue({
      status: plan ? 'confirmed' : 'unconfirmed',
      plan,
      paymentStatus: plan ? 'paid' : null,
      ...extras,
    }),
  });
}

function showConfirmedPlan(plan: string, query?: string) {
  setSearchParams(query ?? `session_id=cs_test&plan_id=${plan}`);
  mockValidatedSessionPlan(plan);
}

describe('CheckoutSuccessPage — plan headline resolution', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('shows "Welcome to Artist Presence" when the checkout session validates pro', async () => {
    setSearchParams('session_id=cs_test&plan_id=pro');
    mockValidatedSessionPlan('pro');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('heading', {
        name: /welcome to artist presence/i,
      })
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
      await screen.findByRole('heading', {
        name: /welcome to artist presence/i,
      })
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

  it('does not declare paid success from billing data when the checkout session is missing', () => {
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('heading', { name: /checkout not confirmed/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /welcome to artist presence/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('checkout-success-status')
    ).not.toBeInTheDocument();
    expect(trackMock).not.toHaveBeenCalledWith(
      'subscription_success',
      expect.any(Object)
    );
    expect(pageMock).not.toHaveBeenCalled();
  });

  it('ignores an unvalidated plan_id when billing data is missing', async () => {
    setSearchParams('plan_id=max');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /checkout not confirmed/i })
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('heading', { name: /welcome to max/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /welcome to your new plan/i })
    ).not.toBeInTheDocument();
  });

  it('shows recovery instead of generic paid success when plan_id is invalid AND billing is missing', () => {
    setSearchParams('plan_id=not-a-real-plan');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('heading', { name: /checkout not confirmed/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /welcome to your new plan/i })
    ).not.toBeInTheDocument();
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
      screen.queryByRole('heading', { name: /welcome to your new plan/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /checkout not confirmed/i })
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
      screen.queryByRole('heading', { name: /welcome to artist presence/i })
    ).not.toBeInTheDocument();
  });

  it('ignores a mismatched raw plan_id and trusts the validated plan', async () => {
    setSearchParams('session_id=cs_test&plan_id=max');
    mockValidatedSessionPlan('pro');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('heading', {
        name: /welcome to artist presence/i,
      })
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
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('shows the certified Artist Presence unlocks instead of legacy Pro tiles', async () => {
    setSearchParams('session_id=cs_test&plan_id=pro');
    mockValidatedSessionPlan('pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByTestId('artist-visibility-activation')
    ).toBeInTheDocument();
    expect(screen.getByText('Release emails')).toBeInTheDocument();
    expect(screen.getByText('Verification')).toBeInTheDocument();
    // Internal-only monitoring is never promised to a paying customer.
    expect(screen.queryByText('Monitor')).not.toBeInTheDocument();
    expect(screen.queryByText(/agentic fixes/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Release Notifications')).not.toBeInTheDocument();
    expect(screen.queryByText('Contact Export')).not.toBeInTheDocument();
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

  it('does not show generic paid tiles when plan cannot be resolved', () => {
    setSearchParams('plan_id=not-a-real-plan');
    mockBilling(null);
    render(<CheckoutSuccessPage />);
    expect(screen.queryByText('Your plan is active')).not.toBeInTheDocument();
    expect(screen.getByTestId('checkout-success-recovery')).toBeInTheDocument();
  });
});

describe('CheckoutSuccessPage — CTAs and verification', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('primary Pro CTA routes to the Identity workspace, with the paid-only export card', async () => {
    showConfirmedPlan('pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('link', { name: /open identity/i })
    ).toHaveAttribute('href', '/app/presence');
    expect(
      screen.getByRole('link', { name: /open your fan list/i })
    ).toHaveAttribute('href', '/app/contacts?tab=audience');
    expect(screen.getByTestId('paid-unlock-fan-list')).toHaveTextContent(
      'Your fan list: export'
    );
    expect(screen.getByTestId('paid-unlock-fan-list')).toHaveTextContent(
      /You're on .+: unlocked/
    );
  });

  it('leads with sharing the live page to collect the first fans', async () => {
    setSearchParams('session_id=cs_test&plan_id=pro');
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: 'confirmed',
        paymentStatus: 'paid',
        plan: 'pro',
        needsProfile: false,
        profileLive: true,
        profileShareUrl: 'https://jov.ie/artist',
      }),
    });
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(await screen.findByTestId('paid-share-prompt')).toHaveTextContent(
      'Share your page to collect your first fans'
    );
    expect(screen.getByTestId('paid-share-link')).toHaveTextContent(
      'jov.ie/artist'
    );
  });

  it('sends a buyer who paid before claiming a link on to claim it', async () => {
    setSearchParams('session_id=cs_test&plan_id=pro');
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: 'confirmed',
        paymentStatus: 'paid',
        plan: 'pro',
        needsProfile: true,
      }),
    });
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('link', { name: /claim your link/i })
    ).toHaveAttribute('href', '/start');
    expect(
      screen.queryByRole('link', { name: /open identity/i })
    ).not.toBeInTheDocument();
  });

  it('secondary CTA routes to /app/releases on Max', async () => {
    showConfirmedPlan('max');
    mockBilling('max');
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('link', { name: /view your releases/i })
    ).toHaveAttribute('href', '/app/releases');
  });

  it('hides the secondary CTA on onboarding flow and shows "Explore your dashboard"', async () => {
    showConfirmedPlan(
      'pro',
      'source=onboarding&session_id=cs_test&plan_id=pro'
    );
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('link', { name: /explore your dashboard/i })
    ).toHaveAttribute('href', '/app');
    expect(
      screen.queryByRole('link', { name: /view your releases/i })
    ).not.toBeInTheDocument();
  });

  it('shows verification button when isPro is true', async () => {
    showConfirmedPlan('pro');
    mockBilling('pro', { isPro: true });
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('button', { name: /request verification/i })
    ).toBeInTheDocument();
  });

  it('hides verification button when isPro is false', async () => {
    showConfirmedPlan('pro');
    mockBilling('pro', { isPro: false });
    render(<CheckoutSuccessPage />);
    await screen.findByTestId('checkout-success-paid');
    expect(
      screen.queryByRole('button', { name: /request verification/i })
    ).not.toBeInTheDocument();
  });
});
