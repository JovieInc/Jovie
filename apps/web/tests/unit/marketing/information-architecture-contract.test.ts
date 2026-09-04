import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  getMarketingInformationPage,
  MARKETING_INFORMATION_PAGES,
  requireMarketingInformationPage,
} from '@/data/marketingInformationArchitecture';
import {
  MARKETING_FOR_FLYOUT_LINKS,
  MARKETING_NAV_LINKS,
  MARKETING_PRODUCT_FLYOUT_LINKS,
} from '@/data/marketingNavigation';
import { RESERVED_USERNAMES } from '@/lib/validation/username-core';

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('canonical marketing information architecture', () => {
  it('keeps the complete requested route set unique and typed', () => {
    const expected = [
      APP_ROUTES.PRODUCT,
      APP_ROUTES.PRODUCT_PROFILES,
      APP_ROUTES.PRODUCT_DISCOVERABILITY,
      APP_ROUTES.PRODUCT_AUDIENCE_INTELLIGENCE,
      APP_ROUTES.PRODUCT_RELATIONSHIPS,
      APP_ROUTES.FOR,
      APP_ROUTES.FOR_ARTISTS,
      APP_ROUTES.FOR_FOUNDERS,
      APP_ROUTES.FOR_CREATORS,
      APP_ROUTES.FOR_AUTHORS,
      APP_ROUTES.HOW_IT_WORKS,
      APP_ROUTES.TOOLS,
      APP_ROUTES.INTEGRATIONS,
    ];
    const actual = MARKETING_INFORMATION_PAGES.map(page => page.path);

    expect(new Set(actual).size).toBe(actual.length);
    expect(actual).toEqual(expected);
    expect(
      MARKETING_INFORMATION_PAGES.filter(page => page.status === 'early-access')
        .length
    ).toBeGreaterThan(0);
  });

  it('resolves known definitions and fails closed for unknown routes', () => {
    expect(getMarketingInformationPage(APP_ROUTES.PRODUCT)?.title).toBe(
      'Product'
    );
    expect(requireMarketingInformationPage(APP_ROUTES.FOR_ARTISTS).status).toBe(
      'live'
    );
    expect(
      getMarketingInformationPage('/not-a-marketing-route')
    ).toBeUndefined();
    expect(() =>
      requireMarketingInformationPage('/not-a-marketing-route')
    ).toThrow('Marketing information page definition is missing');
  });

  it('keeps the shared header hierarchy exact', () => {
    expect(MARKETING_NAV_LINKS.map(link => link.label)).toEqual([
      'Product',
      'For',
      'Tools',
      'Pricing',
    ]);
    expect(MARKETING_PRODUCT_FLYOUT_LINKS.map(link => link.label)).toEqual([
      'Profiles',
      'Discoverability',
      'Audience Intelligence',
      'Relationships',
      'How Jovie Works',
    ]);
    expect(MARKETING_FOR_FLYOUT_LINKS.map(link => link.label)).toEqual([
      'Artists',
      'Founders',
      'Creators',
      'Authors',
    ]);
  });

  it('reserves every new top-level route from public profile claims', () => {
    for (const slug of [
      'product',
      'how-it-works',
      'for',
      'tools',
      'integrations',
    ]) {
      expect(RESERVED_USERNAMES.includes(slug), slug).toBe(true);
    }
  });

  it('routes every new page through the shared type, button, and shell system', () => {
    const composition = readSource(
      'components/marketing/MarketingInformationPage.tsx'
    );
    for (const primitive of [
      'MarketingPageShell',
      'MarketingHero',
      'MarketingContainer',
      'MarketingSectionHeading',
      '<Button',
    ]) {
      expect(composition).toContain(primitive);
    }
    for (const bypass of ['<h1', '<h2', '<button', '<select', 'style={{']) {
      expect(composition).not.toContain(bypass);
    }

    for (const route of [
      'app/(marketing)/product/[[...slug]]/page.tsx',
      'app/(marketing)/for/[[...slug]]/page.tsx',
      'app/(marketing)/how-it-works/page.tsx',
      'app/(marketing)/tools/page.tsx',
      'app/(marketing)/integrations/page.tsx',
    ]) {
      const source = readSource(route);
      expect(source).toContain('MarketingInformationPage');
      expect(source).not.toMatch(/<(?:h1|h2|button|select)\b/u);
    }
  });

  it('keeps pricing controls on canonical UI primitives', () => {
    const source = readSource(
      'components/features/pricing/PricingComparisonChart.tsx'
    );
    expect(source).toContain('NativeSelect');
    expect(source).toContain('<Button');
    expect(source).not.toMatch(/<(?:button|select)\b/u);
  });
});
