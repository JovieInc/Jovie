import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  getMarketingPlanHref,
  getVisibleMarketingPricingPlans,
} from '@/data/marketingPricingPlans';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import {
  getPaidPlanAdditionNames,
  PUBLIC_PRICING_COMPARISON,
} from '@/lib/billing/public-pricing-features';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

  it.each([
    ['tier-cards-neutral', 'compact'],
    ['tier-cards-recommended', 'expanded'],
  ] as const)(
    'renders the %s %s cards with one CTA per plan and no axe violations',
    async (variant, mode) => {
      const { container } = render(
        <MarketingPricingPlans variant={variant} mode={mode} />
      );

      const plans = getVisibleMarketingPricingPlans();
      expect(container.querySelectorAll('article')).toHaveLength(plans.length);
      for (const plan of plans) {
        const card = screen.getByTestId(`marketing-pricing-plan-${plan.id}`);
        const cta = within(card).getByRole('link');
        expect(cta).toHaveAttribute('href', getMarketingPlanHref(plan.id));
        expect(card).toHaveAttribute(
          'data-recommended',
          variant === 'tier-cards-recommended' && plan.id === 'pro'
            ? 'true'
            : 'false'
        );
      }
      await expectNoA11yViolations(container);
    }
  );

  it('drops the cadence and feature rows a plan does not have', async () => {
    const { container } = render(
      <MarketingPricingPlans variant='tier-cards-neutral' mode='expanded' />
    );

    const enterprise = screen.getByTestId('marketing-pricing-plan-enterprise');
    expect(enterprise.querySelector('ul')).toBeNull();
    expect(
      enterprise.querySelector('.marketing-pricing-plan-card__price span')
    ).toBeNull();
    expect(
      screen
        .getByTestId('marketing-pricing-plan-pro')
        .querySelector('.marketing-pricing-plan-card__price span')
    ).toHaveTextContent('/mo');
    await expectNoA11yViolations(container);
  });

  it('reaches every plan CTA by keyboard in card order', async () => {
    const user = userEvent.setup();
    render(<MarketingPricingPlans variant='tier-cards-recommended' />);

    const ctas = getVisibleMarketingPricingPlans().map(plan =>
      within(screen.getByTestId(`marketing-pricing-plan-${plan.id}`)).getByRole(
        'link'
      )
    );
    for (const cta of ctas) {
      await user.tab();
      expect(cta).toHaveFocus();
    }
  });

  it('keeps every plan and CTA inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingPricingPlans variant='tier-cards-recommended' />
      </div>
    );

    expect(screen.getAllByRole('link')).toHaveLength(
      getVisibleMarketingPricingPlans().length
    );
    await expectNoA11yViolations(container);
  });
});
