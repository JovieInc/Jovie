import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROOF_PENDING_TERMS } from '@/lib/claim/proof-terms';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  billing: vi.fn(),
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.stubGlobal('fetch', mocks.fetch);

vi.mock('next/navigation', () => ({
  usePathname: () => '/onboarding/checkout',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => mocks.searchParams(),
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
vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { readonly children?: React.ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));
vi.mock('@/lib/analytics', () => ({
  page: vi.fn(),
  track: vi.fn(),
}));
vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: mocks.billing,
}));
vi.mock('@/app/onboarding/actions/upgrade-offer', () => ({
  recordOnboardingUpgradeOfferDecision: vi.fn().mockResolvedValue(undefined),
}));

import CheckoutSuccessPage from '@/app/billing/success/page';
import { OnboardingCheckoutClient } from '@/app/onboarding/checkout/OnboardingCheckoutClient';

describe('Item 1 & Item 5 — private proof-pending checkout & open-session recovery', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.billing.mockReset();
    mocks.searchParams.mockReset();
    mocks.searchParams.mockReturnValue(new URLSearchParams());
  });

  it('retains <50k unproven artist displayName, catalog preview, and proof-pending terms without claiming live', () => {
    const { container } = render(
      <OnboardingCheckoutClient
        plan='pro'
        profileId='profile-low-reach'
        monthlyPriceId='price_pro_month'
        annualPriceId={null}
        monthlyAmount={1200}
        annualAmount={null}
        displayName='Small Indie Artist'
        username='smallindie'
        avatarUrl={null}
        spotifyFollowers={620}
        isDefaultUpsell
        profileLive={false}
        proofPending
        catalog={{
          total: 2,
          releases: [
            {
              id: 'rel-1',
              title: 'First Light',
              releaseType: 'album',
              releaseDate: '2025-10-01',
              artworkUrl: null,
              spotifyUrl: 'https://open.spotify.com/album/rel1',
            },
          ],
        }}
      />
    );

    expect(screen.getByText('Small Indie Artist')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-catalog-preview')).toHaveTextContent(
      '2 releases ready for your page'
    );
    expect(screen.getByText('First Light')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-go-live-terms')).toHaveTextContent(
      PROOF_PENDING_TERMS
    );
    expect(container.textContent?.toLowerCase()).not.toMatch(
      /\b(?:is|are|stays)\s+live\b/
    );
  });

  it('renders open-session recovery with Complete checkout CTA when Stripe session status is open', async () => {
    mocks.searchParams.mockReturnValue(
      new URLSearchParams('session_id=cs_test_open_123')
    );
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        plan: null,
        priceId: null,
        sessionStatus: 'open',
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_open_123',
      }),
    });
    mocks.billing.mockReturnValue({
      data: { isPro: false, plan: 'free' },
      isLoading: false,
      isFetched: true,
      error: null,
    });

    render(<CheckoutSuccessPage />);

    expect(
      await screen.findByTestId('checkout-success-recovery')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /your checkout session is still open\. complete payment to activate your plan\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId('checkout-resume-open-session')).toHaveAttribute(
      'href',
      'https://checkout.stripe.com/c/pay/cs_test_open_123'
    );
    expect(
      screen.queryByTestId('checkout-success-status')
    ).not.toBeInTheDocument();
  });

  it('suppresses shareUrl and live headline on /billing/success?source=onboarding when proofPending is true (without session_id)', async () => {
    mocks.searchParams.mockReturnValue(
      new URLSearchParams('source=onboarding')
    );
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        plan: null,
        priceId: null,
        needsProfile: false,
        proofPending: true,
        profileLive: false,
        profileShareUrl: 'https://jov.ie/should-never-leak',
      }),
    });
    mocks.billing.mockReturnValue({
      data: { isPro: true, plan: 'pro' },
      isLoading: false,
      isFetched: true,
      error: null,
    });

    render(<CheckoutSuccessPage />);

    expect(await screen.findByText(PROOF_PENDING_TERMS)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Your plan is active' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /live/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('paid-share-prompt')).not.toBeInTheDocument();
  });
});
