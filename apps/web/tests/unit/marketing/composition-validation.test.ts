import { describe, expect, it } from 'vitest';
import {
  assertMarketingComposition,
  MARKETING_SPEC_VERSION,
  type MarketingComposition,
  validateMarketingComposition,
} from '@/data/marketing';

const section = (
  sectionId: MarketingComposition['sections'][number]['sectionId'],
  variantId: string,
  index = 0
): MarketingComposition['sections'][number] => ({
  sectionId,
  variantId,
  ctaPosition: index === 0 ? 'primary' : 'none',
  proofVerified: false,
  degradationRung: 1,
});

const composition = (
  sections: MarketingComposition['sections']
): MarketingComposition => ({
  specVersion: MARKETING_SPEC_VERSION,
  recipeId: 'feature',
  sections,
  primaryCtaLabel: 'Get started',
  ctaCadence: 'hero-and-close',
  trace: [],
});

const codes = (value: MarketingComposition) =>
  validateMarketingComposition(value).issues.map(issue => issue.code);

describe('marketing composition registry gate', () => {
  it('accepts a registered hero followed by registered sections', () => {
    expect(
      validateMarketingComposition(
        composition([
          section('hero', 'centered-none'),
          section('faq', 'objection-handler', 1),
        ])
      )
    ).toEqual({ valid: true, issues: [] });
    expect(
      assertMarketingComposition(
        composition([section('hero', 'centered-none')])
      )
    ).toBeDefined();
  });

  it('rejects missing, repeated, or misplaced heroes', () => {
    expect(codes(composition([section('faq', 'objection-handler')]))).toContain(
      'hero-cardinality'
    );
    expect(
      codes(
        composition([
          section('hero', 'centered-none'),
          section('hero', 'centered-phone', 1),
        ])
      )
    ).toEqual(
      expect.arrayContaining(['hero-cardinality', 'duplicate-cardinality'])
    );
    expect(
      codes(
        composition([
          section('faq', 'objection-handler'),
          section('hero', 'centered-none', 1),
        ])
      )
    ).toContain('hero-order');
  });

  it('rejects variants absent from the registry', () => {
    expect(
      codes(
        composition([
          section('hero', 'not-a-real-variant'),
          section('faq', 'objection-handler', 1),
        ])
      )
    ).toContain('unregistered-variant');
  });
});
