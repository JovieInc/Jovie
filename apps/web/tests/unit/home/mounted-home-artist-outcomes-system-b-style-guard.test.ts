import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const meetJoviePath = 'components/homepage/HomepageMeetJovie.tsx';
const carouselPath = 'components/homepage/MeetJovieCarousel.tsx';
const outcomeCardsPath = 'components/homepage/HomepageOutcomeCards.tsx';
const cssPath = 'app/(home)/home.css';

const forbiddenSourcePatterns = [
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

const forbiddenCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /box-shadow:/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractCssBlock(source: string, name: string): string {
  const start = source.indexOf(`${name} START`);
  const end = source.indexOf(`${name} END`, start);

  expect(start, `${name} CSS block exists`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} CSS block is bounded`).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('mounted homepage Meet Jovie System B source contract', () => {
  it('keeps the Meet Jovie section markup on named System B primitives', () => {
    const source = readFileSync(path.join(webRoot, meetJoviePath), 'utf8');

    for (const pattern of forbiddenSourcePatterns) {
      expect(source, `${meetJoviePath} leaked ${pattern}`).not.toMatch(pattern);
    }

    for (const className of [
      'homepage-meet-jovie',
      'homepage-meet-jovie__header',
      'homepage-meet-jovie__copy',
      'homepage-meet-jovie__heading',
      'homepage-meet-jovie__intro',
    ]) {
      expect(source).toContain(className);
    }
  });

  it('keeps the carousel markup on named System B primitives', () => {
    const source = readFileSync(path.join(webRoot, carouselPath), 'utf8');

    for (const pattern of forbiddenSourcePatterns) {
      expect(source, `${carouselPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    for (const className of [
      'homepage-meet-jovie__carousel',
      'homepage-meet-jovie__controls',
      'homepage-meet-jovie__track',
      'homepage-meet-jovie__card',
      'homepage-artist-outcome',
      'homepage-artist-outcome__media',
      'homepage-artist-outcome__caption',
    ]) {
      expect(source).toContain(className);
    }
  });

  it('keeps outcome cards markup on named System B primitives', () => {
    const source = readFileSync(path.join(webRoot, outcomeCardsPath), 'utf8');

    for (const pattern of forbiddenSourcePatterns) {
      expect(source, `${outcomeCardsPath} leaked ${pattern}`).not.toMatch(
        pattern
      );
    }

    for (const className of [
      'homepage-outcome-section',
      'homepage-outcome-inner',
      'homepage-outcome-heading',
      'homepage-outcome-rail',
      'homepage-outcome-card',
      'homepage-outcome-card__glow',
      'homepage-outcome-card__title',
      'homepage-outcome-card__visual',
    ]) {
      expect(source).toContain(className);
    }

    // Card accents come from System B semantic tokens, never raw hex.
    for (const accent of [
      'var(--color-info)',
      'var(--color-accent)',
      'var(--color-success)',
      'var(--color-warning)',
    ]) {
      expect(source).toContain(accent);
    }
  });

  it('keeps Meet Jovie CSS tokenized and locked to the shared column', () => {
    const css = extractCssBlock(
      readFileSync(path.join(webRoot, cssPath), 'utf8'),
      'HOMEPAGE MEET JOVIE SYSTEM B'
    );

    for (const pattern of forbiddenCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('var(--system-b-bg-page)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--color-text-secondary-token)');
    expect(css).toContain('var(--ds-public-content-max)');
    expect(css).toContain('var(--homepage-page-gutter)');
    expect(css).toContain('var(--homepage-chapter-space)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('var(--font-sans)');
    expect(css).toContain('scroll-snap-type: x mandatory');
    expect(css).toContain('@media (max-width: 767px)');
  });

  it('keeps outcome card CSS tokenized', () => {
    const css = extractCssBlock(
      readFileSync(path.join(webRoot, cssPath), 'utf8'),
      'HOMEPAGE ARTIST OUTCOMES SYSTEM B'
    );

    for (const pattern of forbiddenCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('var(--system-b-app-frame-seam)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--homepage-chapter-rule)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('var(--radius-lg)');
    expect(css).toContain('@media (max-width: 767px)');
  });
});
