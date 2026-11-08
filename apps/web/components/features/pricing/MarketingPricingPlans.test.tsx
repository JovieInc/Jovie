import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import { buildPriceLockView } from '@/lib/billing/price-lock-view';
import {
  getPaidPlanAdditionNames,
  PUBLIC_PRICING_COMPARISON,
} from '@/lib/billing/public-pricing-features';
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
    const proCard = screen.getByTestId('marketing-pricing-plan-pro');
    const proBullets = Array.from(
      proCard.querySelectorAll('.marketing-pricing-plan-card__features li')
    ).map(li => li.textContent);
    // Paid card lists exactly what the comparison table says it adds over Free.
    expect(proBullets).toEqual([...getPaidPlanAdditionNames()]);
    expect(proBullets.length).toBeGreaterThan(0);
    expect(proBullets).toContain('Pre-release & countdown pages');
    expect(proBullets).toContain(
      'Release notifications (email to your audience)'
    );
    const freeCard = screen.getByTestId('marketing-pricing-plan-free');
    for (const bullet of proBullets) {
      expect(freeCard.textContent).not.toContain(bullet);
    }
    for (const li of container.querySelectorAll(
      '.marketing-pricing-plan-card__features li'
    )) {
      expect(li.querySelector('svg')).toBeNull();
    }
  });

  it('never uses the word fan in public pricing feature labels', () => {
    const labels = PUBLIC_PRICING_COMPARISON.flatMap(category =>
      category.features.map(feature => feature.name)
    );
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label).not.toMatch(/\bfans?\b/i);
    }
  });

  it('renders no eyebrow badge pill above the plan name', () => {
    const { container } = render(
      <MarketingPricingPlans variant='tier-cards-neutral' />
    );

    expect(
      container.querySelectorAll('.marketing-pricing-plan-card__badge')
    ).toHaveLength(0);
    for (const badge of ['Free forever', 'Self-serve']) {
      expect(screen.queryByText(badge)).not.toBeInTheDocument();
    }
    for (const card of container.querySelectorAll(
      '.marketing-pricing-plan-card'
    )) {
      expect(
        card.querySelector('.marketing-pricing-plan-card__header')
          ?.firstElementChild
      ).toHaveClass('marketing-pricing-plan-card__name');
    }
  });
});
