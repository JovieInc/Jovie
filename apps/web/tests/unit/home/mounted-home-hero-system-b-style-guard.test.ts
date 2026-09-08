import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const pagePath = 'app/(home)/page.tsx';
const heroComponentPath = 'components/homepage/HomepageEditorialHero.tsx';
const searchComponentPath = 'components/features/home/HeroSpotifySearch.tsx';
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
  /box-shadow:/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractMountedHeroCss(source: string): string {
  const start = source.indexOf('HOMEPAGE EDITORIAL HERO START');
  const end = source.indexOf('HOMEPAGE EDITORIAL HERO END', start);

  expect(start, 'mounted hero CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'mounted hero CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

function extractMountedHeroPageSource(source: string): string {
  const heroStart = source.indexOf('function HomepageHero()');
  const heroEnd = source.indexOf('function HomepageUnlockedSections()');

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

    // The homepage owns copy; the hero primitive owns the abstract composition;
    // the existing name search is the only control.
    expect(pageSource).toContain('<HomepageEditorialHero');
    expect(pageSource).not.toContain('HomeTrustSection');
    expect(pageSource).not.toMatch(/statsRow|stats=\{/);
    expect(pageSource).not.toContain('secondaryCta');
    expect(heroComponentSource).toContain("appearance='editorial'");
    expect(heroComponentSource).toContain(
      "submitTestId='homepage-primary-cta'"
    );
    expect(heroComponentSource).not.toMatch(/<Button|<Link|href=/);

    for (const className of [
      'homepage-editorial-hero',
      'homepage-editorial-hero__backdrop',
      'homepage-editorial-hero__light-well',
      'homepage-editorial-hero__copy',
      'homepage-editorial-hero__headline',
      'homepage-editorial-hero__support',
      'homepage-editorial-hero__search',
    ]) {
      expect(heroComponentSource).toContain(className);
    }
  });

  it('keeps the editorial name-search pill on the shared Button atom', () => {
    const searchSource = readFileSync(
      path.join(webRoot, searchComponentPath),
      'utf8'
    );

    expect(searchSource).toContain("from '@jovie/ui/atoms/button'");
    expect(searchSource).toMatch(
      /<Button[\s\S]*?size='marketing'[\s\S]*?variant='primary'[\s\S]*?className='homepage-name-search__submit/
    );
    expect(searchSource).toContain("appearance = 'default'");
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
    expect(css).toContain('var(--homepage-grid-max)');
    expect(css).toContain('var(--homepage-grid-gutter)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('var(--font-satoshi)');
    expect(css).toContain('font-weight: var(--font-weight-bold);');
    expect(css).toContain(
      'letter-spacing: var(--ds-marketing-display-tracking);'
    );
    expect(css).toContain('border-radius: var(--radius-pill);');
    expect(css).toContain('min-height: 100svh;');
    // Every scrim color is mixed from a token, never a raw value.
    const tokenMixes = css.match(/color-mix\(\s*in oklab,\s*var\(--system-b-/g);
    expect(tokenMixes?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
