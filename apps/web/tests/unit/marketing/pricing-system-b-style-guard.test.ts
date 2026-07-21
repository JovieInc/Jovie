import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSourcePath = 'app/(marketing)/pricing/page.tsx';
const comparisonChartPath =
  'components/features/pricing/PricingComparisonChart.tsx';
const marketingPlansPath =
  'components/features/pricing/MarketingPricingPlans.tsx';
const designSystemPath = 'styles/design-system.css';

const forbiddenRouteVisualPatterns = [
  /style=\{/,
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /--linear-/,
  /\b(?:bg|border|text|ring|shadow|decoration)-\[/,
  /\b(?:rounded|text|h|w|max-w|min-h|tracking|leading|px|py|pt|pb|z)-\[/,
  /\b(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|black|white)-(?:[0-9]|\[|\/)/,
  /[☰☷✉■☆✓×▶□]/,
  /&#(?:10024|9634|9654|9654|9679);/,
] as const;

const forbiddenPricingCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /--linear-/,
  /color-mix\(in oklab,\s*(?:white|black)\b/,
  /(?:background|color|border(?:-[^:]+)?|box-shadow|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractPricingCss(source: string): string {
  const start = source.indexOf(':where(.system-b-pricing-page)');
  const nextSectionMarkers = [
    '/* ============================================\n   SYSTEM B BRAND PAGE',
    '/* ============================================\n   SYSTEM B CHAT ENTITY PREVIEW PRIMITIVES',
    '/* ============================================\n   GEIST ACCENT PALETTE',
  ];
  const end = nextSectionMarkers
    .map(marker => source.indexOf(marker, start))
    .filter(index => index > start)
    .sort((a, b) => a - b)[0];

  expect(start, 'pricing CSS block exists').toBeGreaterThanOrEqual(0);
  expect(
    end,
    'pricing CSS block is bounded before the next section'
  ).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('pricing page System B source contract', () => {
  it('keeps pricing page visuals on named System B primitives', () => {
    const sources = [
      [
        pageSourcePath,
        readFileSync(resolve(process.cwd(), pageSourcePath), 'utf8'),
      ],
      [
        comparisonChartPath,
        readFileSync(resolve(process.cwd(), comparisonChartPath), 'utf8'),
      ],
      [
        marketingPlansPath,
        readFileSync(resolve(process.cwd(), marketingPlansPath), 'utf8'),
      ],
    ] as const;

    for (const [sourcePath, source] of sources) {
      for (const pattern of forbiddenRouteVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('labels both comparison tables with a visually hidden caption', () => {
    const source = readFileSync(
      resolve(process.cwd(), comparisonChartPath),
      'utf8'
    );

    // WCAG SC 1.3.1: desktop and mobile tables need a programmatic name.
    const captions = source.match(/<caption className='sr-only'>/g) ?? [];
    expect(captions).toHaveLength(2);
    expect(source).toContain('Feature comparison by plan');
    expect(source).toContain('Feature comparison for selected plan');
  });

  it('keeps exactly one page-level primary action on pricing', () => {
    const source = readFileSync(resolve(process.cwd(), pageSourcePath), 'utf8');

    // The canonical MarketingHero owns the single page-level primary action
    // (it renders data-primary-action='true' on its primary CTA).
    expect(source.match(/<MarketingHero/g) ?? []).toHaveLength(1);
    expect(source.match(/primaryCta=\{\{/g) ?? []).toHaveLength(1);
    expect(
      source,
      `${pageSourcePath} should not hand-roll primary actions`
    ).not.toMatch(/data-primary-action/);
    expect(
      source,
      `${pageSourcePath} should not use global primary CTAs`
    ).not.toMatch(/public-action-primary/);
  });

  it('keeps pricing System B CSS within stable tokenized bounds', () => {
    const source = extractPricingCss(
      readFileSync(resolve(process.cwd(), designSystemPath), 'utf8')
    );

    for (const pattern of forbiddenPricingCssPatterns) {
      expect(source, `${designSystemPath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }

    for (const declaration of source.match(/letter-spacing:\s*[^;]+;/g) ?? []) {
      expect(declaration).toMatch(/letter-spacing:\s*0\s*;/);
    }
  });
});
