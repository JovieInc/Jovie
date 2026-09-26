import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PricingPage from '@/app/(marketing)/pricing/page';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import { getVisibleMarketingPricingPlans } from '@/data/marketingPricingPlans';
import {
  ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
  FORBIDDEN_PUBLIC_PRICING_PAGE_MARKERS,
} from '@/lib/billing/offer-truth';
import { PricingRecipeBody } from './PricingRecipeBody';
import { PRICING_RECIPE_STORY_REQUEST_ACCESS_COPY } from './PricingRecipeBody.stories';

const proPlan = getVisibleMarketingPricingPlans().find(
  plan => plan.id === 'pro'
);
const expectedRequestAccessCopy = PRICING_RECIPE_STORY_REQUEST_ACCESS_COPY;

describe('PricingRecipeBody', () => {
  it('renders the production pricing route with limited-access JSON-LD', () => {
    const { container } = render(<PricingPage />);

    expect(
      screen.getByTestId('marketing-pricing-plan-free')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('marketing-pricing-plan-pro')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('marketing-pricing-plan-enterprise')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('marketing-pricing-plan-max')).toBeNull();
    expect(screen.queryByText('Max')).toBeNull();
    expect(screen.queryByText('$149')).toBeNull();
    expect(screen.getByTestId('marketing-pricing-plan-pro')).toHaveTextContent(
      '$199'
    );
    expect(
      screen.getAllByRole('link', { name: 'Request access' })[0]
    ).toHaveAttribute('href', '/waitlist');
    expect(
      container.querySelector(
        `[data-offer-contract="${ARTIST_VISIBILITY_OFFER_CONTRACT_ID}"]`
      )
    ).not.toBeNull();
    const pageText = container.textContent ?? '';
    for (const marker of FORBIDDEN_PUBLIC_PRICING_PAGE_MARKERS) {
      expect(pageText).not.toContain(marker);
    }
    expect(screen.queryByText('Automated follow-ups')).toBeNull();
    expect(screen.queryByText('Email campaigns')).toBeNull();

    const schemaScript = container.querySelector(
      'script[type="application/ld+json"]'
    );
    expect(schemaScript).not.toBeNull();
    const schema = JSON.parse(schemaScript?.textContent ?? '{}') as {
      mainEntity?: {
        itemListElement?: Array<{
          item?: { name?: string; offers?: { availability?: string } };
        }>;
      };
    };
    const items = schema.mainEntity?.itemListElement ?? [];
    expect(items.map(item => item.item?.name)).toEqual([
      'Jovie Free',
      'Jovie Pro',
      'Jovie Enterprise',
    ]);
    expect(items[1]?.item?.offers?.availability).toBe(
      'https://schema.org/LimitedAvailability'
    );
  });

  it('renders the shipped pricing sections and exact injected production slots', () => {
    render(
      <PricingRecipeBody
        requestAccessCopy={expectedRequestAccessCopy}
        plans={<div data-testid='plans-slot'>Production plans</div>}
        comparisonChart={
          <div data-testid='comparison-slot'>Production comparison</div>
        }
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Pricing' })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Public artist profile and audience capture',
      })
    ).toBeVisible();
    expect(screen.getByTestId('plans-slot')).toBeVisible();
    expect(screen.getByTestId('comparison-slot')).toBeVisible();
    expect(screen.getByText(expectedRequestAccessCopy)).toBeVisible();
    expect(
      screen.getAllByRole('link', { name: 'Claim my free profile' })[0]
    ).toBeVisible();
    expect(
      screen.getAllByRole('link', { name: 'Claim my free profile' })[1]
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Request access' })
    ).toHaveAttribute('href', '/waitlist');
    expect(screen.getByRole('link', { name: 'Contact sales' })).toHaveAttribute(
      'href',
      'mailto:support@jov.ie'
    );
  });

  it('keeps the story closing copy derived from exact production plan data', () => {
    expect(PRICING_RECIPE_STORY_REQUEST_ACCESS_COPY).toBe(
      expectedRequestAccessCopy
    );
  });

  it('serializes the Pro plan, price, and access intent before hydration', () => {
    const markup = renderToStaticMarkup(
      <PricingRecipeBody
        requestAccessCopy={expectedRequestAccessCopy}
        plans={
          <MarketingPricingPlans mode='expanded' variant='tier-cards-neutral' />
        }
        comparisonChart={<div>Production comparison</div>}
      />
    );
    const document = new DOMParser().parseFromString(
      `<body>${markup}</body>`,
      'text/html'
    );
    const proCard = document.querySelector(
      '[data-testid="marketing-pricing-plan-pro"]'
    );

    expect(proPlan).toBeDefined();
    expect(proCard).not.toBeNull();
    expect(proCard?.textContent).toContain('Pro');
    expect(proPlan?.price).toBeDefined();
    expect(proCard?.textContent).toContain(proPlan?.price ?? '');
    expect(proCard?.textContent).toContain('/mo');
    expect(proCard?.textContent).toContain(proPlan?.ctaLabel ?? '');
    expect(proCard?.querySelector('a')?.getAttribute('href')).toBe('/waitlist');
  });

  it('shares one route/story body and records shipped zero-proof omissions', () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), 'app/(marketing)/pricing/page.tsx'),
      'utf8'
    );
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/PricingRecipeBody.stories.tsx'
      ),
      'utf8'
    );
    const bodySource = readFileSync(
      resolve(process.cwd(), 'components/organisms/PricingRecipeBody.tsx'),
      'utf8'
    );

    expect(routeSource).toContain('<PricingRecipeBody');
    expect(routeSource).toContain('safeJsonLdStringify(PRICING_SCHEMA)');
    expect(routeSource).toContain(
      "<MarketingPricingPlans mode='expanded' variant='tier-cards-neutral' />"
    );
    expect(routeSource).toContain(
      'comparisonChart={<PricingComparisonChart />}'
    );
    expect(routeSource).not.toContain("headline='Pricing'");

    expect(storySource).toContain('component: PricingRecipeBody');
    expect(storySource).toContain("registryId: 'recipe.pricing'");
    expect(storySource).toContain(
      "<MarketingPricingPlans mode='expanded' variant='tier-cards-neutral' />"
    );
    expect(storySource).toContain(
      'comparisonChart={<PricingComparisonChart />}'
    );

    expect(bodySource).not.toContain('FaqSection');
    expect(bodySource).not.toContain('SocialProof');
    expect(bodySource).not.toContain('LogoCloud');
    expect(storySource).toContain(
      "omissions: ['logo-cloud', 'social-proof', 'faq']"
    );
  });

  it('records true provenance for the recipe.pricing story sourceSha', () => {
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/PricingRecipeBody.stories.tsx'
      ),
      'utf8'
    );

    const match = storySource.match(/sourceSha: '([0-9a-f]{40})'/);
    expect(match).not.toBeNull();
    const sourceSha = match?.[1] as string;
    expect(sourceSha).toBe('00895196e53b823bb0311193b4af29f67b8849c1');
    expect(storySource).toContain(
      "source: 'apps/web/components/organisms/PricingRecipeBody.tsx'"
    );
  });
});
