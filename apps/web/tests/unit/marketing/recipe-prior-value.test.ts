import { describe, expect, it } from 'vitest';
import {
  getMarketingSection,
  hasRequiredPrior,
  MARKETING_RECIPES,
  resolveComposition,
} from '@/data/marketing';

const brief = (
  overrides: {
    desiredConversion?: 'start' | 'claim-handle' | 'request-access';
    brandConstraints?: { waitlistEnabled: boolean };
  } = {}
) => ({
  businessObjective:
    'Help visitors understand the product and choose a next step.',
  targetAudience: 'general' as const,
  desiredConversion: 'start' as const,
  trafficSource: 'home' as const,
  intent: 'category' as const,
  availableAssets: {
    socialProofVerified: false,
    statsVerified: false,
    logoCloudVerified: false,
  },
  ...overrides,
});

describe('semantic prior value requirements', () => {
  it('keeps hero mandatory and accepts an explicit value-framing alternative', () => {
    const capture = getMarketingSection('capture');

    expect(capture.requiresPrior).toContain('hero');
    expect(capture.requiresPriorAnyOf).toContainEqual([
      'feature-grid',
      'feature-split',
      'how-it-works',
      'content-prose',
      'blog-feed',
    ]);
    expect(hasRequiredPrior('capture', ['hero', 'feature-split'])).toBe(true);
    expect(hasRequiredPrior('capture', ['hero', 'how-it-works'])).toBe(true);
    expect(hasRequiredPrior('capture', ['hero'])).toBe(false);
    expect(hasRequiredPrior('capture', ['feature-split'])).toBe(false);
  });

  it('places waitlist comprehension before capture without weakening adjacency rules', () => {
    const waitlist = MARKETING_RECIPES.find(recipe => recipe.id === 'waitlist');
    expect(waitlist).toBeDefined();
    expect(waitlist?.sectionOrder).toEqual([
      'hero',
      'feature-split',
      'capture',
      'faq',
      'cta',
    ]);
    expect(waitlist?.sectionOrder.indexOf('feature-split')).toBeLessThan(
      waitlist?.sectionOrder.indexOf('capture') ?? -1
    );
    expect(getMarketingSection('capture').illegalAfter).toContain('hero');

    const composition = resolveComposition(
      brief({ desiredConversion: 'request-access' })
    );
    expect(composition.recipeId).toBe('waitlist');
    expect(composition.sections.map(section => section.sectionId)).toEqual([
      'hero',
      'feature-split',
      'capture',
      'faq',
      'cta',
    ]);
  });

  it('keeps a legal homepage story when feature-grid is absent', () => {
    const composition = resolveComposition(brief());
    const sectionIds = composition.sections.map(section => section.sectionId);

    expect(composition.recipeId).toBe('homepage');
    expect(sectionIds).not.toContain('feature-grid');
    expect(
      sectionIds.filter(sectionId => sectionId === 'feature-split')
    ).toHaveLength(3);
    expect(sectionIds).toContain('spec-wall');
    expect(sectionIds).toContain('pricing');
    expect(sectionIds).toContain('cta');
  });

  it('keeps explicit request and content beats in the recipes that need them', () => {
    const comparison = MARKETING_RECIPES.find(
      recipe => recipe.id === 'comparison'
    );
    const seo = MARKETING_RECIPES.find(recipe => recipe.id === 'seo');
    const blog = MARKETING_RECIPES.find(recipe => recipe.id === 'blog-landing');
    const newsletter = MARKETING_RECIPES.find(
      recipe => recipe.id === 'newsletter-signup'
    );

    expect(comparison?.sectionOrder.slice(0, 3)).toEqual([
      'hero',
      'feature-grid',
      'comparison',
    ]);
    expect(seo?.sectionOrder.indexOf('content-prose')).toBeLessThan(
      seo?.sectionOrder.indexOf('faq') ?? -1
    );
    expect(blog?.sectionOrder.indexOf('blog-feed')).toBeLessThan(
      blog?.sectionOrder.indexOf('capture') ?? -1
    );
    expect(newsletter?.sectionOrder).toEqual([
      'hero',
      'content-prose',
      'capture',
      'faq',
      'cta',
    ]);
  });

  it('does not turn a claim-handle brief into a waitlist because the flag is on', () => {
    const composition = resolveComposition(
      brief({
        desiredConversion: 'claim-handle',
        brandConstraints: { waitlistEnabled: true },
      })
    );

    expect(composition.recipeId).toBe('homepage');
  });
});
