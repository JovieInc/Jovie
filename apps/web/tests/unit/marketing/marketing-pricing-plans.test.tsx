import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import { getPublicPriceClaim } from '@/lib/billing/offer-truth';

describe('MarketingPricingPlans', () => {
  it('renders the canonical Free, Pro, and Enterprise plans by default', () => {
    render(
      <MarketingPricingPlans mode='compact' variant='tier-cards-neutral' />
    );

    for (const plan of ['free', 'pro', 'enterprise']) {
      expect(
        screen.getByTestId(`marketing-pricing-plan-${plan}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`marketing-pricing-plan-${plan}`)
      ).toHaveAttribute('data-plan-active', 'true');
    }
    expect(screen.queryByTestId('marketing-pricing-plan-team')).toBeNull();
    expect(screen.queryByTestId('marketing-pricing-plan-max')).toBeNull();
  });

  it('uses public claim CTAs, including limited-access Pro and Enterprise', () => {
    const freeClaim = getPublicPriceClaim('free');
    const proClaim = getPublicPriceClaim('pro');
    const enterpriseClaim = getPublicPriceClaim('enterprise');
    render(
      <MarketingPricingPlans mode='compact' variant='tier-cards-neutral' />
    );

    expect(
      screen.getByRole('link', { name: freeClaim.ctaLabel })
    ).toHaveAttribute('href', freeClaim.ctaHref);
    expect(
      within(screen.getByTestId('marketing-pricing-plan-pro')).getByRole(
        'link',
        { name: proClaim.ctaLabel }
      )
    ).toHaveAttribute('href', proClaim.ctaHref);
    expect(
      within(screen.getByTestId('marketing-pricing-plan-enterprise')).getByRole(
        'link',
        { name: enterpriseClaim.ctaLabel }
      )
    ).toHaveAttribute('href', enterpriseClaim.ctaHref);
    expect(
      screen.getAllByRole('link').map(link => link.getAttribute('href'))
    ).not.toContain('/signup?plan=team');
    expect(
      screen.getAllByRole('link').map(link => link.getAttribute('href'))
    ).not.toContain('/signup?plan=enterprise');
    expect(
      within(screen.getByTestId('marketing-pricing-plan-pro')).getByRole(
        'link',
        { name: proClaim.ctaLabel }
      )
    ).toHaveAttribute('href', '/waitlist');
    expect(
      screen.queryByRole('link', { name: 'Start Free Trial' })
    ).not.toBeInTheDocument();
  });

  it('keeps default pricing plan cards neutral instead of plan-accented', () => {
    render(
      <MarketingPricingPlans mode='compact' variant='tier-cards-neutral' />
    );

    for (const plan of ['free', 'pro', 'enterprise']) {
      expect(
        screen.getByTestId(`marketing-pricing-plan-${plan}`).className
      ).not.toMatch(/marketing-pricing-plan-card--(?:blue|pink|violet)/);
    }
  });

  it('marks the neutral variant with equal-weight cards and 44px CTAs', () => {
    render(
      <MarketingPricingPlans mode='expanded' variant='tier-cards-neutral' />
    );

    expect(
      screen.getByTestId('marketing-pricing-plan-free').parentElement
    ).toHaveAttribute('data-marketing-variant', 'tier-cards-neutral');
    for (const plan of ['free', 'pro', 'enterprise']) {
      const card = screen.getByTestId(`marketing-pricing-plan-${plan}`);
      expect(card).toHaveAttribute('data-recommended', 'false');
      const cta = within(card).getByRole('link');
      expect(cta).toHaveAttribute('data-variant', 'secondary');
      expect(cta).toHaveAttribute('data-size', 'lg');
    }
  });

  it('marks only Pro as recommended and gives it the primary CTA', () => {
    render(
      <MarketingPricingPlans mode='compact' variant='tier-cards-recommended' />
    );

    const proCard = screen.getByTestId('marketing-pricing-plan-pro');
    expect(proCard.parentElement).toHaveAttribute(
      'data-marketing-variant',
      'tier-cards-recommended'
    );
    expect(proCard).toHaveAttribute('data-recommended', 'true');
    expect(within(proCard).getByRole('link')).toHaveAttribute(
      'data-variant',
      'primary'
    );
    expect(within(proCard).getByText('Limited access')).toBeInTheDocument();

    for (const plan of ['free', 'enterprise']) {
      const card = screen.getByTestId(`marketing-pricing-plan-${plan}`);
      expect(card).toHaveAttribute('data-recommended', 'false');
      expect(within(card).getByRole('link')).toHaveAttribute(
        'data-variant',
        'ghost'
      );
    }
  });

  it('maps the legacy full-list Max visibility flag to Enterprise', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_MARKETING_VISIBLE_PLANS', 'free,pro,max');

    try {
      const isolatedPlans = await import('@/data/marketingPricingPlans');
      expect(
        isolatedPlans.getVisibleMarketingPricingPlans().map(plan => plan.id)
      ).toEqual(['free', 'pro', 'enterprise']);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
