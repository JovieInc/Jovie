import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const pricingComponentPath =
  'components/marketing/homepage-v2/HomepageV2Ctas.tsx';
const cssPath = 'app/(home)/home.css';

const forbiddenPricingSourcePatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /\b(?:bg|border|text|ring|shadow|rounded|h|w|max-w|min-h|tracking|leading|px|py|pt|pb|z)-\[/,
  /\btext-white(?:\/|\b)/,
  /\b(?:white|black|blue|violet|sky|cyan|pink|fuchsia|emerald|amber|orange|rose|red)-(?:[0-9]|\[|\/)/,
  /\bshadow-(?:sm|md|lg|xl|2xl|inner|\[)/,
  /\b(?:transition-all|transition-transform|hover:brightness|hover:scale|hover:translate|hover:-translate|group-hover:scale|group-hover:translate|group-hover:-translate)\b/,
] as const;

const forbiddenPricingCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /box-shadow:(?!\s*(?:none|var\())/,
  /letter-spacing:\s*-[^;]+/,
  /font-size:[^;]*vw/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractPricingComponentSource(source: string): string {
  const start = source.indexOf('export function HomepageV2Pricing()');
  const end = source.indexOf('export function HomepageV2FinalCta()', start);

  expect(start, 'homepage pricing source exists').toBeGreaterThanOrEqual(0);
  expect(end, 'homepage pricing source is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

function extractPricingCss(source: string): string {
  const start = source.indexOf('HOMEPAGE PRICING SYSTEM B START');
  const end = source.indexOf('HOMEPAGE PRICING SYSTEM B END', start);

  expect(start, 'mounted pricing CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'mounted pricing CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('mounted homepage pricing System B source contract', () => {
  it('keeps mounted pricing markup on named System B primitives', () => {
    const source = extractPricingComponentSource(
      readFileSync(path.join(webRoot, pricingComponentPath), 'utf8')
    );

    for (const pattern of forbiddenPricingSourcePatterns) {
      expect(source, `${pricingComponentPath} leaked ${pattern}`).not.toMatch(
        pattern
      );
    }

    // The shared MarketingPricingPlans internals stay untouched; the homepage
    // scopes its System B treatment through wrapper classes that only
    // home.css (loaded under .home-viewport) styles.
    expect(source).toContain("data-testid='homepage-v2-pricing'");
    expect(source).toContain('homepage-pricing-shell');
    expect(source).toContain('homepage-pricing-copy');
    for (const className of [
      'system-b-mounted-home-pricing',
      'system-b-mounted-home-pricing-container',
      'system-b-mounted-home-pricing-shell',
      'system-b-mounted-home-pricing-copy',
      'system-b-mounted-home-pricing-plans',
    ]) {
      expect(source).toContain(className);
    }
  });

  it('keeps mounted pricing CSS tokenized and stable', () => {
    const css = extractPricingCss(
      readFileSync(path.join(webRoot, cssPath), 'utf8')
    );

    for (const pattern of forbiddenPricingCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    // Homepage-only scoping so the shared /new route never picks these up.
    expect(css).toContain('.home-viewport .system-b-mounted-home-pricing');

    // Shared homepage grid column: canonical content max + page gutter.
    expect(css).toContain('var(--ds-public-content-max)');
    expect(css).toContain('var(--homepage-page-gutter)');
    expect(css).toContain('grid-column: 1 / -1;');

    expect(css).toContain('var(--system-b-bg-page)');
    expect(css).toContain('var(--system-b-bg-surface-0)');
    expect(css).toContain('var(--system-b-app-frame-seam)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--color-text-secondary-token)');
    expect(css).toContain('var(--color-text-tertiary-token)');
    expect(css).toContain('var(--radius-xl)');
    expect(css).toContain('var(--radius-pill)');
    expect(css).toContain('var(--text-4xl)');
    expect(css).toContain('var(--text-lg)');
    expect(css).toContain('var(--text-sm)');
    expect(css).toContain('var(--text-xs)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('box-shadow: none;');
    expect(css).toContain('letter-spacing: 0;');
    expect(css).toContain('@media (max-width: 767px)');
  });
});
