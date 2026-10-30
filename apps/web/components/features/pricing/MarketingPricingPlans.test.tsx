import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import { buildPriceLockView } from '@/lib/billing/price-lock-view';
import { MarketingPricingPlans } from './MarketingPricingPlans';

const auth = vi.hoisted(() => ({ isSignedIn: false, fetchPriceLock: vi.fn() }));
vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isSignedIn: auth.isSignedIn }),
}));
vi.mock('@/lib/queries/usePriceLockQuery', () => ({
  fetchPriceLock: auth.fetchPriceLock,
}));

beforeEach(() => {
  auth.isSignedIn = false;
  auth.fetchPriceLock.mockReset();
});

describe('MarketingPricingPlans signed-in price lock', () => {
  it('shows a signed-in person their locked price on the Pro card', async () => {
    auth.isSignedIn = true;
    auth.fetchPriceLock.mockResolvedValue(
      buildPriceLockView({
        plan: 'pro',
        priceVersionId: 'old',
        currency: 'usd',
        monthlyAmountCents: 900,
        yearlyAmountCents: null,
        stripePriceIdMonthly: 'price_9',
        stripePriceIdYearly: null,
        source: 'signup',
        lockedAt: '2026-10-29T00:00:00.000Z',
      })
    );
    render(<MarketingPricingPlans variant='tier-cards-neutral' />);
    await waitFor(() =>
      expect(screen.getByTestId('locked-plan-price')).toHaveTextContent('$9/mo')
    );
    expect(screen.getByTestId('price-lock-note')).toHaveTextContent(
      'Your price is locked at $9/mo.'
    );
  });

  it('shows the list price to a signed-out visitor', () => {
    render(<MarketingPricingPlans variant='tier-cards-neutral' />);
    expect(screen.queryByTestId('locked-plan-price')).toBeNull();
    expect(auth.fetchPriceLock).not.toHaveBeenCalled();
  });
});

describe('MarketingPricingPlans', () => {
  it('locks the public plan cards to the Artist Visibility offer', () => {
    const { container } = render(
      <MarketingPricingPlans variant='tier-cards-neutral' />
    );

    expect(
      container.querySelector(
        `[data-offer-contract="${ARTIST_VISIBILITY_OFFER_CONTRACT_ID}"]`
      )
    ).not.toBeNull();
    expect(screen.getByText('Artist Presence')).toBeInTheDocument();
    expect(screen.getByText('$12')).toBeInTheDocument();
    expect(screen.queryByText('Max')).not.toBeInTheDocument();
    expect(screen.queryByText('$149')).not.toBeInTheDocument();
    const features = container.querySelectorAll(
      '.marketing-pricing-plan-card__features li'
    );
    expect(features.length).toBeGreaterThan(0);
    for (const feature of features) {
      expect(feature.textContent).toBe(
        'Public Jovie profile and audience capture'
      );
      expect(feature.querySelector('svg')).toBeNull();
    }
  });
});
