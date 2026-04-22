import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clearPlanIntentMock, fetchMock, hrefState, trackMock } = vi.hoisted(
  () => ({
    clearPlanIntentMock: vi.fn(),
    fetchMock: vi.fn(),
    hrefState: { current: 'http://localhost/onboarding/checkout' },
    trackMock: vi.fn(),
  })
);

vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly [key: string]: unknown;
  }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams('returnTo=%2Fapp%2Fdashboard%2Fearnings'),
}));

vi.mock('@/components/molecules/Avatar/Avatar', () => ({
  Avatar: ({ alt }: { readonly alt: string }) => (
    <div role='img' aria-label={alt} />
  ),
}));

vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({
    children,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
}));

vi.mock('@/lib/analytics', () => ({ track: trackMock }));

vi.mock('@/lib/auth/plan-intent', () => ({
  clearPlanIntent: clearPlanIntentMock,
}));

vi.mock('@/lib/entitlements/registry', () => ({
  getEntitlements: () => ({
    marketing: { displayName: 'Pro', tagline: 'For serious artists' },
  }),
}));

import { OnboardingCheckoutClient } from '@/app/onboarding/checkout/OnboardingCheckoutClient';

const defaultProps = {
  plan: 'pro' as const,
  monthlyPriceId: 'price_monthly',
  annualPriceId: 'price_annual',
  monthlyAmount: 3900,
  annualAmount: 39000,
  displayName: 'Tim White',
  username: 'timwhite',
  avatarUrl: 'https://example.com/avatar.jpg',
  spotifyFollowers: 5000,
  isDefaultUpsell: false,
};

describe('OnboardingCheckoutClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    hrefState.current = 'http://localhost/onboarding/checkout';
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: {
        get href() {
          return hrefState.current;
        },
        set href(value: string) {
          hrefState.current = value;
        },
      },
    });
  });

  it('renders the live profile preview with the monthly price by default', () => {
    render(<OnboardingCheckoutClient {...defaultProps} />);

    expect(
      screen.getByRole('heading', { name: 'Upgrade to Pro' })
    ).toBeInTheDocument();
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.getByText('@timwhite')).toBeInTheDocument();
    expect(screen.getByText('5,000 Spotify followers')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Upgrade to Pro' })
    ).toBeInTheDocument();
    expect(screen.getByText('$39')).toBeInTheDocument();
    expect(screen.getByText('/mo')).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith(
      'onboarding_checkout_shown',
      expect.objectContaining({
        plan: 'pro',
        has_spotify: true,
        has_annual: true,
        intent_source: 'paid_intent',
      })
    );
  });

  it('updates the displayed price when annual billing is selected', async () => {
    const user = userEvent.setup();
    render(<OnboardingCheckoutClient {...defaultProps} />);

    await user.click(screen.getByRole('radio', { name: /annual/i }));

    expect(screen.getByText('$390')).toBeInTheDocument();
    expect(screen.getByText('/yr')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /annual/i })).toBeChecked();
  });

  it('starts checkout with the selected annual price id and onboarding return target', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/session_123' }),
    });

    render(<OnboardingCheckoutClient {...defaultProps} />);

    await user.click(screen.getByRole('radio', { name: /annual/i }));
    await user.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stripe/checkout',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            priceId: 'price_annual',
            returnTo: '/app/chat?from=onboarding&panel=profile',
            source: 'onboarding',
          }),
        })
      );
    });

    expect(trackMock).toHaveBeenCalledWith(
      'onboarding_checkout_initiated',
      expect.objectContaining({
        plan: 'pro',
        price_id: 'price_annual',
        interval: 'year',
        intent_source: 'paid_intent',
      })
    );
    expect(hrefState.current).toBe('https://checkout.stripe.com/session_123');
  });

  it('shows an alert when checkout fails and restores the CTA state', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Checkout is temporarily unavailable.' }),
    });

    render(<OnboardingCheckoutClient {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));

    expect(
      await screen.findByRole('alert', {
        name: '',
      })
    ).toHaveTextContent('Checkout is temporarily unavailable.');
    expect(
      screen.getByRole('button', { name: 'Upgrade to Pro' })
    ).toBeEnabled();
    expect(hrefState.current).toBe('http://localhost/onboarding/checkout');
  });

  it('clears paid intent and redirects back to the normalized free path when skipped', async () => {
    const user = userEvent.setup();
    render(<OnboardingCheckoutClient {...defaultProps} />);

    await user.click(
      screen.getByRole('button', { name: 'Continue with Free' })
    );

    expect(clearPlanIntentMock).toHaveBeenCalled();
    expect(trackMock).toHaveBeenCalledWith(
      'onboarding_checkout_skipped',
      expect.objectContaining({
        plan: 'pro',
        intent_source: 'paid_intent',
      })
    );
    expect(hrefState.current).toBe('/app/chat?from=onboarding&panel=profile');
  });
});
