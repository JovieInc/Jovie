import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const pagePath = 'app/(home)/page.tsx';
const heroComponentPath = 'components/homepage/HomepagePosterHero.tsx';
const cssPath = 'app/(home)/home.css';

const forbiddenPageChromePatterns = [
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

const forbiddenHeroCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /background(?:-image)?:[^;]*(?:linear-gradient|radial-gradient)/,
  /box-shadow:/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractMountedHeroCss(source: string): string {
  const start = source.indexOf('HOMEPAGE POSTER HERO SYSTEM B START');
  const end = source.indexOf('HOMEPAGE POSTER HERO SYSTEM B END', start);

  expect(start, 'mounted hero CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'mounted hero CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

function extractMountedHeroPageSource(source: string): string {
  const heroStart = source.indexOf('function HomepageHero()');
  const heroEnd = source.indexOf('function HomepageOpportunity()');

  expect(heroStart, 'homepage hero source exists').toBeGreaterThanOrEqual(0);
  expect(heroEnd, 'homepage hero source is bounded').toBeGreaterThan(heroStart);

  return source.slice(heroStart, heroEnd);
}

describe('mounted homepage hero System B source contract', () => {
  it('keeps mounted hero markup on named System B primitives', () => {
    const pageSource = extractMountedHeroPageSource(
      readFileSync(path.join(webRoot, pagePath), 'utf8')
    );
    const heroComponentSource = readFileSync(
      path.join(webRoot, heroComponentPath),
      'utf8'
    );

    for (const pattern of forbiddenPageChromePatterns) {
      expect(pageSource, `${pagePath} leaked ${pattern}`).not.toMatch(pattern);
      expect(
        heroComponentSource,
        `${heroComponentPath} leaked ${pattern}`
      ).not.toMatch(pattern);
    }

    // The homepage owns its approved poster composition so shared marketing
    // hero routes cannot drift when this surface iterates.
    expect(pageSource).toContain('<HomepagePosterHero');
    expect(pageSource).toContain('<HomepageElectricSeam');
    expect(pageSource).toContain('homepage-trust-section');
    expect(pageSource).not.toMatch(/statsRow|stats=\{/);

    for (const className of [
      'homepage-poster-hero',
      'homepage-poster-hero__copy',
      'homepage-poster-hero__headline',
      'homepage-poster-hero__subtitle',
      'homepage-poster-hero__actions',
      'homepage-poster-hero__seam',
      'homepage-poster-hero__media',
    ]) {
      expect(heroComponentSource).toContain(className);
    }
  });

  it('keeps mounted hero shell CSS tokenized and stable', () => {
    const css = extractMountedHeroCss(
      readFileSync(path.join(webRoot, cssPath), 'utf8')
    );

    for (const pattern of forbiddenHeroCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('var(--system-b-bg-page)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--color-text-secondary-token)');
    expect(css).toContain('var(--ds-public-content-max)');
    expect(css).toContain('var(--homepage-page-gutter)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('var(--font-satoshi)');
    expect(css).toContain(
      'letter-spacing: var(--ds-marketing-display-tracking);'
    );
    expect(css).toContain('font-size: var(--ds-marketing-display-size);');
    expect(css).toContain('line-height: var(--ds-marketing-display-leading);');
    expect(css).toContain('font-size: var(--ds-marketing-lede-size);');
    expect(css).toContain('mask-image: linear-gradient(');
    expect(css).toContain('min-height: var(--space-6);');
  });
});
