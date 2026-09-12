import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PricingPage, { metadata } from '@/app/(marketing)/pricing/page';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import {
  getVisibleMarketingPricingPlans,
  PRICING_REQUEST_ACCESS_COPY,
} from '@/data/marketingPricingPlans';
import { PricingRecipeBody } from './PricingRecipeBody';
import { PRICING_RECIPE_STORY_REQUEST_ACCESS_COPY } from './PricingRecipeBody.stories';

const proPlan = getVisibleMarketingPricingPlans().find(
  plan => plan.id === 'pro'
);
const expectedRequestAccessCopy = PRICING_REQUEST_ACCESS_COPY;

describe('PricingRecipeBody', () => {
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
        name: 'Your public artist profile',
      })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Build your audience',
      })
    ).toBeVisible();
    expect(screen.getByTestId('plans-slot')).toBeVisible();
    expect(screen.getByTestId('comparison-slot')).toBeVisible();
    expect(screen.getByText(expectedRequestAccessCopy)).toBeVisible();
    for (const link of screen.getAllByRole('link', { name: /Request access/i }))
      expect(link).toHaveAttribute('href', 'https://jov.ie/waitlist');
    expect(screen.queryByRole('link', { name: /trial/i })).toBeNull();
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

  it('serializes the Pro plan, price, and limited access before hydration', () => {
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
    expect(proCard?.textContent).toContain('Request access');
    expect(proCard?.querySelector('a')?.getAttribute('href')).toBe(
      'https://jov.ie/waitlist'
    );
  });

  it('keeps machine-readable offers aligned with unavailable public checkout', () => {
    const markup = renderToStaticMarkup(<PricingPage />);
    const document = new DOMParser().parseFromString(markup, 'text/html');
    const schema = JSON.parse(
      document.querySelector('script[type="application/ld+json"]')
        ?.textContent ?? '{}'
    );
    expect(
      schema.mainEntity.itemListElement.map(
        (entry: { item: { name: string } }) => entry.item.name
      )
    ).toEqual(['Jovie Free', 'Jovie Pro', 'Jovie Enterprise']);
    expect(JSON.stringify(schema)).not.toMatch(
      /InStock|priceValidUntil|offers/
    );
    expect(metadata.description).toContain('$199 monthly');
    expect(markup).not.toMatch(/signup\?plan=(pro|max)|Start Pro trial/);
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
