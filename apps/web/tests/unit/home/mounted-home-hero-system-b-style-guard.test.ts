import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const pagePath = 'app/(home)/page.tsx';
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
  /\b(?:transition-all|transition-transform|hover:brightness|active:scale|hover:-translate|group-hover:scale)\b/,
] as const;

const forbiddenHeroCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /box-shadow:/,
  /letter-spacing:\s*-[^;]+/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractMountedHeroCss(source: string): string {
  const start = source.indexOf('SYSTEM B MOUNTED HOME HERO SHELL PRIMITIVES');
  const end = source.indexOf(
    'SYSTEM B MOUNTED HOME HERO SHELL PRIMITIVES END',
    start
  );

  expect(start, 'mounted hero CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'mounted hero CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

function extractMountedHeroPageSource(source: string): string {
  const actionsStart = source.indexOf('function HomepageHeroActions');
  const actionsEnd = source.indexOf('function HomepageProductStatement');
  const heroStart = source.indexOf(
    "className='homepage-hero-stage system-b-mounted-home-hero-stage'"
  );
  const heroEnd = source.indexOf('homepage-trust-section', heroStart);

  expect(actionsStart, 'hero actions source exists').toBeGreaterThanOrEqual(0);
  expect(actionsEnd, 'hero actions source is bounded').toBeGreaterThan(
    actionsStart
  );
  expect(heroStart, 'mounted hero source exists').toBeGreaterThanOrEqual(0);
  expect(heroEnd, 'mounted hero source is bounded').toBeGreaterThan(heroStart);

  return `${source.slice(actionsStart, actionsEnd)}\n${source.slice(
    heroStart,
    heroEnd
  )}`;
}

describe('mounted homepage hero System B source contract', () => {
  it('keeps mounted hero markup on named System B primitives', () => {
    const source = extractMountedHeroPageSource(
      readFileSync(path.join(webRoot, pagePath), 'utf8')
    );

    for (const pattern of forbiddenPageChromePatterns) {
      expect(source, `${pagePath} leaked ${pattern}`).not.toMatch(pattern);
    }

    for (const className of [
      'system-b-mounted-home-hero-stage',
      'system-b-mounted-home-hero-shell',
      'system-b-mounted-home-hero-inner',
      'system-b-mounted-home-hero-copy',
      'system-b-mounted-home-hero-headline',
      'system-b-mounted-home-hero-subhead',
      'system-b-mounted-home-hero-actions',
      'system-b-mounted-home-hero-primary',
      'system-b-mounted-home-hero-secondary',
    ]) {
      expect(source).toContain(className);
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
    expect(css).toContain('var(--system-b-app-frame-seam)');
    expect(css).toContain('var(--system-b-primary-bg)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--color-text-tertiary-token)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('min-height: 100vh;');
    expect(css).toContain('min-height: 100svh;');
    expect(css).toContain('@supports (height: 100svh)');
    expect(css).toMatch(/@supports\s*\(\s*background:\s*color-mix\(/);
    expect(css).toContain(
      'min-height: calc(var(--space-10) + var(--space-0-5));'
    );
  });
});
