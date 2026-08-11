import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getVisibleMarketingPricingPlans } from '@/data/marketingPricingPlans';
import { PricingRecipeBody } from './PricingRecipeBody';
import { PRICING_RECIPE_STORY_REQUEST_ACCESS_COPY } from './PricingRecipeBody.stories';

const paidPlans = getVisibleMarketingPricingPlans().filter(
  plan => plan.id !== 'free'
);
const paidPlanName = paidPlans.length === 1 ? paidPlans[0]?.name : null;
const expectedRequestAccessCopy = paidPlanName
  ? `Claim the profile first. Choose ${paidPlanName} when you want the release system turned on.`
  : 'Claim the profile first. Choose a paid plan when you want the release system turned on.';

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
        name: 'Artist profiles built to convert',
      })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Capture fans once. Bring them back automatically.',
      })
    ).toBeVisible();
    expect(screen.getByTestId('plans-slot')).toBeVisible();
    expect(screen.getByTestId('comparison-slot')).toBeVisible();
    expect(screen.getByText(expectedRequestAccessCopy)).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Claim Your Profile' })
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Claim your profile' })
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Start Pro trial' })
    ).toHaveAttribute('href', '/signup?plan=pro');
  });

  it('keeps the story closing copy derived from exact production plan data', () => {
    expect(PRICING_RECIPE_STORY_REQUEST_ACCESS_COPY).toBe(
      expectedRequestAccessCopy
    );
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
});
