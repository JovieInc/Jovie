import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import { MarketingPricingPlans } from './MarketingPricingPlans';

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
    expect(screen.getByText('$199')).toBeInTheDocument();
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
