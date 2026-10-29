import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type PoliteAnnouncer,
  registerPoliteAnnouncer,
  resetAnnouncedEventIds,
} from '@/lib/a11y/announce';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const {
  fetchMock,
  pageMock,
  trackMock,
  useBillingStatusQueryMock,
  useReducedMotionMock,
  searchParamsMock,
  routerReplaceMock,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  pageMock: vi.fn(),
  trackMock: vi.fn(),
  useBillingStatusQueryMock: vi.fn(),
  useReducedMotionMock: vi.fn(() => false),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
  routerReplaceMock: vi.fn(),
}));

vi.stubGlobal('fetch', fetchMock);

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
  useRouter: () => ({ replace: routerReplaceMock }),
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

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => useReducedMotionMock(),
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

function mockValidatedSessionPlan(plan: string | null, ok = true) {
  fetchMock.mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue({ plan }),
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolver => {
    resolve = resolver;
  });

  return { promise, resolve };
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

  it('falls back to billing data when plan_id is absent', () => {
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('heading', { name: /welcome to artist presence/i })
    ).toBeInTheDocument();
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
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(false);
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('shows Artist Visibility activation instead of legacy Pro unlock tiles', async () => {
    setSearchParams('session_id=cs_test&plan_id=pro');
    mockValidatedSessionPlan('pro');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByTestId('artist-visibility-activation')
    ).toBeInTheDocument();
    expect(screen.getByText('Monitor')).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
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
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(false);
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('primary Pro CTA routes to Artist Visibility', () => {
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('link', { name: /open artist visibility/i })
    ).toHaveAttribute('href', '/app/presence');
  });

  it('sends a buyer who paid before claiming a link on to claim it', async () => {
    setSearchParams('session_id=cs_test&plan_id=pro');
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ plan: 'pro', needsProfile: true }),
    });
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByRole('link', { name: /claim your link/i })
    ).toHaveAttribute('href', '/start');
    expect(
      screen.queryByRole('link', { name: /open artist visibility/i })
    ).not.toBeInTheDocument();
  });

  it('secondary CTA routes to /app/releases on Max', () => {
    mockBilling('max');
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('link', { name: /view your releases/i })
    ).toHaveAttribute('href', '/app/releases');
  });

  it('hides the secondary CTA on onboarding flow and shows "Explore your dashboard"', () => {
    setSearchParams('source=onboarding');
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('link', { name: /explore your dashboard/i })
    ).toHaveAttribute('href', '/app');
    expect(
      screen.queryByRole('link', { name: /view your releases/i })
    ).not.toBeInTheDocument();
  });

  it('shows verification button when isPro is true', () => {
    mockBilling('pro', { isPro: true });
    render(<CheckoutSuccessPage />);
    expect(
      screen.getByRole('button', { name: /request verification/i })
    ).toBeInTheDocument();
  });

  it('hides verification button when isPro is false', () => {
    mockBilling('pro', { isPro: false });
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

  it('emits subscription_success + checkout_success after paid entitlement is reconciled', () => {
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

  it('emits checkout_celebration_shown once when billing and session plans differ', async () => {
    const deferredPlan = createDeferred<{
      ok: true;
      json: () => Promise<{ plan: string }>;
    }>();

    setSearchParams('session_id=cs_test&plan_id=max');
    fetchMock.mockReturnValue(deferredPlan.promise);
    mockBilling('pro');
    render(<CheckoutSuccessPage />);

    expect(trackMock).not.toHaveBeenCalledWith('checkout_celebration_shown', {
      planType: 'pro',
    });
    expect(trackMock).not.toHaveBeenCalledWith(
      'subscription_success',
      expect.any(Object)
    );
    expect(screen.getByTestId('checkout-success-pending')).toBeInTheDocument();

    deferredPlan.resolve({
      ok: true,
      json: async () => ({ plan: 'max' }),
    });

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('checkout_celebration_shown', {
        planType: 'max',
      });
    });
    expect(
      trackMock.mock.calls.filter(
        ([event]) => event === 'checkout_celebration_shown'
      )
    ).toHaveLength(1);
  });

  it('emits paid-success analytics once even when reduced motion resolves after first render', async () => {
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
    useReducedMotionMock.mockReturnValue(true);
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(screen.queryByTestId('confetti-overlay')).not.toBeInTheDocument();
  });

  it('never celebrates a payment with confetti, even when motion is allowed', () => {
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    // JOV-9035: paying is a transaction, not an achievement — the checkout
    // success moment never celebrates with confetti (Apple: celebrate rarely).
    expect(screen.queryByTestId('confetti-overlay')).not.toBeInTheDocument();
  });

  it('does not declare paid success when checkout-session fetch fails', async () => {
    setSearchParams('session_id=cs_test&plan_id=pro');
    mockValidatedSessionPlan(null, false);
    mockBilling('pro');
    render(<CheckoutSuccessPage />);
    expect(
      await screen.findByTestId('checkout-success-recovery')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /welcome to your new plan/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('confetti-overlay')).not.toBeInTheDocument();
    expect(trackMock).not.toHaveBeenCalledWith(
      'subscription_success',
      expect.any(Object)
    );
    expect(
      screen.getByRole('button', { name: /retry checkout/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('keeps pending chrome and no conversion events while billing is still loading', () => {
    mockBilling(null, { isLoading: true });
    render(<CheckoutSuccessPage />);
    expect(screen.getByTestId('checkout-success-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('confetti-overlay')).not.toBeInTheDocument();
    expect(pageMock).not.toHaveBeenCalled();
  });
});

describe('CheckoutSuccessPage — checkout success moment (JOV-9035)', () => {
  let announcerSpy: ReturnType<typeof vi.fn<PoliteAnnouncer>>;

  beforeEach(() => {
    fetchMock.mockReset();
    pageMock.mockReset();
    trackMock.mockReset();
    useBillingStatusQueryMock.mockReset();
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(false);
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
    routerReplaceMock.mockReset();
    resetAnnouncedEventIds();
    announcerSpy = vi.fn<PoliteAnnouncer>();
    registerPoliteAnnouncer(announcerSpy);
  });

  afterEach(() => {
    registerPoliteAnnouncer(null);
    resetAnnouncedEventIds();
    vi.useRealTimers();
  });

  /** Flush the session-fetch microtask chain under fake timers. */
  async function flushSessionValidation() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it('acknowledges the payment once, holds 600ms, then lands on the from feature with focus', async () => {
    vi.useFakeTimers();
    setSearchParams('session_id=cs_moment_1&plan_id=pro&from=/app/chat');
    mockValidatedSessionPlan('pro');
    mockBilling(null);

    render(<CheckoutSuccessPage />);
    await flushSessionValidation();

    expect(screen.getByTestId('checkout-success-paid')).toBeInTheDocument();

    // Acknowledged exactly once through the single app-level polite region.
    expect(announcerSpy).toHaveBeenCalledTimes(1);
    expect(announcerSpy).toHaveBeenCalledWith(
      'Payment complete. Artist Presence is active.'
    );

    // No navigation before the 600ms acknowledgement hold.
    expect(routerReplaceMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(599);
    });
    expect(routerReplaceMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    // Lands on the unlocked feature — not /billing — with the h1 focus marker.
    expect(routerReplaceMock).toHaveBeenCalledWith('/app/chat?focus=heading');

    // Later timer ticks never duplicate the acknowledgement or navigation.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(announcerSpy).toHaveBeenCalledTimes(1);
    expect(routerReplaceMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the plan destination when no from is set', async () => {
    vi.useFakeTimers();
    setSearchParams('session_id=cs_moment_2&plan_id=pro');
    mockValidatedSessionPlan('pro');
    mockBilling(null);

    render(<CheckoutSuccessPage />);
    await flushSessionValidation();

    expect(screen.getByTestId('checkout-success-paid')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(routerReplaceMock).toHaveBeenCalledWith(
      '/app/presence?focus=heading'
    );
  });

  it('never auto-navigates a billing-entitled visit without a checkout session', async () => {
    vi.useFakeTimers();
    mockBilling('pro');

    render(<CheckoutSuccessPage />);
    await flushSessionValidation();

    expect(screen.getByTestId('checkout-success-paid')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(routerReplaceMock).not.toHaveBeenCalled();
    expect(announcerSpy).not.toHaveBeenCalled();
  });

  it('draws the check without any transform change under reduced motion', async () => {
    vi.useFakeTimers();
    useReducedMotionMock.mockReturnValue(true);
    setSearchParams('session_id=cs_moment_3&plan_id=pro&from=/app/releases');
    mockValidatedSessionPlan('pro');
    mockBilling(null);

    render(<CheckoutSuccessPage />);
    await flushSessionValidation();

    const check = screen.getByTestId('checkout-success-check');

    // Reduced motion REPLACES the transform with an opacity cross-fade: no
    // transform is ever declared or transitioned.
    expect(check.style.transform).toBe('');
    expect(check.style.transition).not.toContain('transform');
    expect(check.style.transition).toContain(
      'opacity var(--duration-fast) var(--ease-out)'
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(routerReplaceMock).toHaveBeenCalledWith(
      '/app/releases?focus=heading'
    );
  });

  it('draws the check with the spring scale and token easings under motion', async () => {
    vi.useFakeTimers();
    setSearchParams('session_id=cs_moment_4&plan_id=pro');
    mockValidatedSessionPlan('pro');
    mockBilling(null);

    render(<CheckoutSuccessPage />);
    await flushSessionValidation();

    const check = screen.getByTestId('checkout-success-check');

    expect(check.style.transition).toContain(
      'stroke-dashoffset var(--duration-slow) var(--ease-out)'
    );
    expect(check.style.transition).toContain(
      'transform var(--duration-slow) var(--ease-spring)'
    );
  });

  it('routes the primary CTA to the from feature ahead of the plan default', async () => {
    setSearchParams('session_id=cs_moment_5&plan_id=pro&from=/app/library');
    mockValidatedSessionPlan('pro');
    mockBilling(null);

    const { container } = render(<CheckoutSuccessPage />);
    await waitFor(() => {
      expect(screen.getByTestId('checkout-success-paid')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('link', { name: 'Open your unlocked feature' })
    ).toHaveAttribute('href', '/app/library');
    expect(
      screen
        .getByRole('link', { name: 'Open your unlocked feature' })
        .getAttribute('href')
    ).not.toContain('/billing');

    await expectNoA11yViolations(container);
  });
});
