import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  clearPlanIntentMock,
  fetchMock,
  hrefState,
  recordOfferDecisionMock,
  trackMock,
} = vi.hoisted(() => ({
  clearPlanIntentMock: vi.fn(),
  fetchMock: vi.fn(),
  hrefState: { current: 'http://localhost/onboarding/checkout' },
  recordOfferDecisionMock: vi.fn().mockResolvedValue({ ok: true }),
  trackMock: vi.fn(),
}));

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
  usePathname: () => '/onboarding/checkout',
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

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({
    main,
    containerClassName: _containerClassName,
    contentClassName: _contentClassName,
    rightPanel: _rightPanel,
    ...props
  }: {
    readonly main?: React.ReactNode;
    readonly containerClassName?: string;
    readonly contentClassName?: string;
    readonly rightPanel?: React.ReactNode;
    readonly [key: string]: unknown;
  }) => (
    <div data-testid='app-shell-frame' {...props}>
      {main}
    </div>
  ),
}));

vi.mock('@/components/organisms/sidebar', () => ({
  SidebarProvider: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='sidebar-provider'>{children}</div>
  ),
}));

vi.mock('@/lib/analytics', () => ({ track: trackMock }));

vi.mock('@/lib/auth/plan-intent', () => ({
  clearPlanIntent: clearPlanIntentMock,
}));

vi.mock('@/app/onboarding/actions/upgrade-offer', () => ({
  recordOnboardingUpgradeOfferDecision: recordOfferDecisionMock,
}));

vi.mock('@/lib/entitlements/registry', () => ({
  getEntitlements: () => ({
    marketing: {
      displayName: 'Artist Presence',
      tagline: 'For serious artists',
    },
  }),
}));

import { OnboardingCheckoutClient } from '@/app/onboarding/checkout/OnboardingCheckoutClient';

const appRoot = resolve(__dirname, '../../..');
const checkoutClientSourcePath =
  'app/onboarding/checkout/OnboardingCheckoutClient.tsx';

const defaultProps = {
  plan: 'pro' as const,
  profileId: null as string | null,
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
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    hrefState.current = 'http://localhost/onboarding/checkout';
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });
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
      screen.getByRole('heading', { name: 'Upgrade To Artist Presence' })
    ).toBeInTheDocument();
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.getByText('@timwhite')).toBeInTheDocument();
    expect(screen.getByText('5,000 Spotify followers')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeInTheDocument();
    expect(screen.getByText('$39.00')).toBeInTheDocument();
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

  it('keeps the checkout upgrade CTA on neutral primary button styling', () => {
    const source = readFileSync(
      resolve(appRoot, checkoutClientSourcePath),
      'utf8'
    );
    const checkoutCtaSource = source.match(
      /<Button\s+[\s\S]*?onClick=\{handleCheckout\}[\s\S]*?<\/Button>/
    )?.[0];

    expect(checkoutCtaSource).toBeDefined();
    expect(checkoutCtaSource).toContain("variant='primary'");
    expect(checkoutCtaSource).not.toContain("variant='accent'");
    expect(checkoutCtaSource).not.toMatch(
      /bg-accent|text-accent-foreground|hover:bg-accent/
    );
  });

  it('updates the displayed price when annual billing is selected', async () => {
    const user = userEvent.setup();
    render(<OnboardingCheckoutClient {...defaultProps} />);

    await user.click(screen.getByRole('radio', { name: /annual/i }));

    expect(screen.getByText('$390.00')).toBeInTheDocument();
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
    await user.click(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    );

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

    await user.click(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    );

    expect(
      await screen.findByRole('alert', {
        name: '',
      })
    ).toHaveTextContent('Checkout is temporarily unavailable.');
    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
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

  it('emits proof-to-claim checkout when session attribution is present', () => {
    window.sessionStorage.setItem('jovie_proof_claim', '1');
    render(<OnboardingCheckoutClient {...defaultProps} />);

    expect(trackMock).toHaveBeenCalledWith(
      'checkout',
      expect.objectContaining({
        campaignKey: 'proof-to-claim',
        plan: 'pro',
        source: 'onboarding_checkout',
      })
    );
  });

  it('does not emit proof-to-claim checkout without attribution', () => {
    render(<OnboardingCheckoutClient {...defaultProps} />);
    expect(trackMock).not.toHaveBeenCalledWith('checkout', expect.anything());
  });

  it('presents the Artist Presence offer once with an honest free-forever note', () => {
    render(
      <OnboardingCheckoutClient
        {...defaultProps}
        isDefaultUpsell
        profileId='11111111-1111-4111-8111-111111111111'
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Upgrade To Artist Presence' })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/free forever/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Keep My Free Profile' })
    ).toBeInTheDocument();
  });

  it('leads with canonical offer outcomes and never contradicts the live profile', () => {
    render(<OnboardingCheckoutClient {...defaultProps} isDefaultUpsell />);

    // Hierarchy: heading → profile identity → outcomes → price → CTA → free keep.
    const heading = screen.getByRole('heading', {
      name: 'Upgrade To Artist Presence',
    });
    const cta = screen.getByRole('button', {
      name: 'Upgrade to Artist Presence',
    });
    const keepFree = screen.getByRole('button', {
      name: 'Keep My Free Profile',
    });
    expect(heading.compareDocumentPosition(cta)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(cta.compareDocumentPosition(keepFree)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    // Outcome-led value from canonical offer truth.
    for (const outcome of [
      'Continuous visibility monitoring',
      'Prioritized opportunities',
      'Agentic fixes',
    ]) {
      expect(screen.getByText(outcome)).toBeInTheDocument();
    }

    // The profile is already live — "start free" copy must never appear.
    expect(screen.queryByText(/start free/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/stays live and free forever/i)
    ).toBeInTheDocument();
  });

  it('renders a deliberate empty state instead of placeholder chrome', () => {
    render(
      <OnboardingCheckoutClient
        {...defaultProps}
        displayName=''
        username=''
        avatarUrl={null}
        spotifyFollowers={null}
      />
    );

    expect(screen.getByText('Your artist profile')).toBeInTheDocument();
    // No fake handle or placeholder glyph.
    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
    expect(screen.queryByText('?')).not.toBeInTheDocument();
  });

  it('records the offer as accepted server-side when upgrade starts', async () => {
    const user = userEvent.setup();
    const profileId = '11111111-1111-4111-8111-111111111111';
    render(
      <OnboardingCheckoutClient {...defaultProps} profileId={profileId} />
    );

    await user.click(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    );

    expect(recordOfferDecisionMock).toHaveBeenCalledWith(
      profileId,
      'accepted',
      'pro'
    );
  });

  it('records the offer as dismissed server-side when skipped', async () => {
    const user = userEvent.setup();
    const profileId = '11111111-1111-4111-8111-111111111111';
    render(
      <OnboardingCheckoutClient {...defaultProps} profileId={profileId} />
    );

    await user.click(
      screen.getByRole('button', { name: 'Continue with Free' })
    );

    expect(recordOfferDecisionMock).toHaveBeenCalledWith(
      profileId,
      'dismissed',
      'pro'
    );
  });

  it('does not record a decision when no profile is attached', async () => {
    const user = userEvent.setup();
    render(<OnboardingCheckoutClient {...defaultProps} />);

    await user.click(
      screen.getByRole('button', { name: 'Continue with Free' })
    );

    expect(recordOfferDecisionMock).not.toHaveBeenCalled();
  });
});
