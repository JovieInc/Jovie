import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARKETING_PRICING_VARIANTS } from '@/components/features/pricing/MarketingPricingPlans';
import {
  getMarketingSection,
  MARKETING_ROUTE_MANIFEST,
  MARKETING_SECTION_REGISTRY,
  resolveComposition,
} from '@/data/marketing';

function readSource(sourcePath: string): string {
  return readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
}

function pricingBinding(route: '/new' | '/pricing') {
  const manifestEntry = MARKETING_ROUTE_MANIFEST.find(
    entry => entry.url === route
  );
  expect(manifestEntry, route).toBeDefined();

  const binding = manifestEntry?.renderedSections.find(
    candidate =>
      candidate.kind === 'approved-section' && candidate.sectionId === 'pricing'
  );
  expect(binding, `${route} pricing binding`).toBeDefined();
  return binding;
}

describe('section.pricing variant contract', () => {
  it('keeps exactly the two shipped tier-card variants active', () => {
    const section = getMarketingSection('pricing');
    const registry = MARKETING_SECTION_REGISTRY.find(
      entry => entry.id === 'section.pricing'
    );

    const activeVariantIds = section.variants
      .filter(variant => variant.status === 'active')
      .map(variant => variant.id);
    expect(activeVariantIds).toEqual([...MARKETING_PRICING_VARIANTS]);
    expect(
      section.variants
        .filter(variant => variant.status === 'unproven')
        .map(variant => variant.id)
    ).toEqual([
      'binary-standard-custom',
      'decision-assistant',
      'one-liner-link',
    ]);
    expect(registry?.source).toBe(
      'components/features/pricing/MarketingPricingPlans'
    );
    expect(registry?.variants).toEqual(
      section.variants.map(variant => variant.id)
    );
  });

  it('binds /pricing to neutral and /new to Pro-recommended', () => {
    expect(pricingBinding('/pricing')).toMatchObject({
      componentPath: 'apps/web/app/(marketing)/pricing/page.tsx',
      variantId: 'tier-cards-neutral',
    });
    expect(pricingBinding('/new')).toMatchObject({
      componentPath:
        'apps/web/components/marketing/homepage-v2/HomepageV2Ctas.tsx',
      variantId: 'tier-cards-recommended',
    });

    const pricingRoute = readSource('app/(marketing)/pricing/page.tsx');
    const homepagePricing = readSource(
      'components/marketing/homepage-v2/HomepageV2Ctas.tsx'
    );
    expect(pricingRoute).toContain("variant='tier-cards-neutral'");
    expect(pricingRoute).not.toContain("variant='tier-cards-recommended'");
    expect(homepagePricing).toContain("variant='tier-cards-recommended'");
  });

  it('resolves the pricing recipe to neutral and homepage to recommended', () => {
    const sharedBrief = {
      businessObjective: 'Convert visitors to start',
      targetAudience: 'general' as const,
      desiredConversion: 'start' as const,
    };
    const pricing = resolveComposition({
      ...sharedBrief,
      intent: 'price',
      trafficSource: 'search',
    });
    const homepage = resolveComposition({
      ...sharedBrief,
      intent: 'category',
      trafficSource: 'home',
    });

    expect(
      pricing.sections.find(section => section.sectionId === 'pricing')
        ?.variantId
    ).toBe('tier-cards-neutral');
    expect(
      homepage.sections.find(section => section.sectionId === 'pricing')
        ?.variantId
    ).toBe('tier-cards-recommended');
  });

  it('keeps the canonical section and pricing-recipe stories neutral', () => {
    const sectionStories = readSource(
      'components/marketing/storybook/MarketingSections.stories.tsx'
    );
    const recipeStories = readSource(
      'components/marketing/storybook/MarketingRecipes.stories.tsx'
    );
    const sectionStory = sectionStories.slice(
      sectionStories.indexOf('export const pricing: Story'),
      sectionStories.indexOf('export const comparison: Story')
    );
    const recipeStory = recipeStories.slice(
      recipeStories.indexOf('export const pricing: Story'),
      recipeStories.indexOf('export const artistLp: Story')
    );

    for (const source of [sectionStory, recipeStory]) {
      expect(source).toContain("variant='tier-cards-neutral'");
      expect(source).not.toContain("variant='tier-cards-recommended'");
    }
  });

  it('keeps tier cards 3-up at 1024, 1-up at 390, and token-only', () => {
    const globals = readSource('app/globals.css');
    const start = globals.indexOf('.marketing-pricing-plans {');
    const end = globals.indexOf('.public-action-inline {', start);
    const pricingCss = globals.slice(start, end);

    expect(pricingCss).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr));'
    );
    expect(pricingCss).toContain('@media (max-width: 700px)');
    expect(pricingCss).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(pricingCss).not.toMatch(/repeat\((?:2|4),/);
    expect(pricingCss).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|gradient\(/i);

    const renderer = readSource(
      'components/features/pricing/MarketingPricingPlans.tsx'
    );
    expect(renderer).toContain("size='lg'");
    expect(renderer).toContain('data-variant={variant}');
    expect(renderer).toContain(
      "data-recommended={recommended ? 'true' : 'false'}"
    );
    expect(renderer).not.toMatch(/\banimation\b|\btransition\b/);
  });
});
