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
      'homepage-meet-jovie__inner',
      'homepage-meet-jovie__heading',
      'homepage-meet-jovie__heading-primary',
      'homepage-meet-jovie__heading-secondary',
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
      'homepage-artist-profiles__row',
      'homepage-artist-profiles__track',
      'homepage-artist-profiles__card',
      'homepage-artist-outcome',
      'homepage-artist-outcome__copy',
      'homepage-artist-outcome__media',
      'homepage-artist-outcome__device',
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

    for (const pattern of forbiddenCssPatterns.filter(
      pattern => pattern.source !== 'linear-gradient|radial-gradient'
    )) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('background: linear-gradient(');
    expect(css).toContain('var(--system-b-bg-surface-0)');
    expect(css).toContain('var(--system-b-bg-page)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--color-text-tertiary-token)');
    expect(css).toContain('var(--ds-public-content-max)');
    expect(css).toContain('var(--homepage-page-gutter)');
    expect(css).toContain('var(--homepage-section-title-size)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('var(--font-sans)');
    expect(css).toContain(
      'border-top: var(--space-px) solid var(--homepage-chapter-rule)'
    );
    expect(css).toContain(
      'border-radius: var(--radius-2xl) var(--radius-2xl) 0 0'
    );
    expect(css).toContain('var(--system-b-bg-surface-0)');
    expect(css).toContain('homepage-meet-jovie__heading-primary');
    expect(css).toContain('homepage-meet-jovie__heading-secondary');
    expect(css).toContain('display: block');
    expect(css).not.toContain('homepage-meet-jovie__eyebrow');
    expect(css).not.toContain('font-size: var(--homepage-section-copy-size)');
  });

  it('keeps the proof transition layered, layout-stable, and motion-safe', () => {
    const source = readFileSync(path.join(webRoot, cssPath), 'utf8');

    expect(source).toContain('homepage-proof-logos-parallax');
    expect(source).toContain('animation-range: cover 60% exit 96%');
    expect(source).toContain('opacity: 1');
    expect(source).toContain('opacity: 0.18');
    expect(source).toContain(
      'transform: translate3d(0, calc(var(--space-4) * -1), 0) scale(0.99)'
    );
    expect(source).toContain('homepage-meet-jovie-panel-glide');
    expect(source).toContain('animation-timeline: view()');
    expect(source).toContain('transform: translate3d(0, 0, 0)');
    expect(source).toContain(
      'transform: translate3d(0, calc(var(--space-16) * -1), 0)'
    );
    expect(source).toContain(
      '.homepage-story-stack > .homepage-artist-profiles'
    );
    expect(source).toContain('border-top: 0');
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.homepage-meet-jovie/
    );
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?opacity: 1;[\s\S]*?transform: none;/
    );
    expect(source).toContain('.homepage-closed-loop-section::before');
    expect(source).toContain('filter: blur(110px)');
  });

  it('keeps the Artist Profiles header as a same-scale two-line lockup', () => {
    const css = extractCssBlock(
      readFileSync(path.join(webRoot, cssPath), 'utf8'),
      'HOMEPAGE ARTIST PROFILES SYSTEM B'
    );

    expect(css).toContain('justify-content: space-between');
    expect(css).toContain('homepage-artist-profiles__lockup');
    expect(css).toContain('margin: var(--space-1) 0 0');
    expect(css).toContain('homepage-artist-profiles__action');

    for (const token of [
      'var(--homepage-section-title-size)',
      'var(--font-weight-semibold)',
      'var(--ds-marketing-title-leading)',
      'var(--ds-marketing-title-tracking)',
    ]) {
      expect(
        css.match(new RegExp(token.replace(/[()]/g, '\\$&'), 'g'))
      ).toHaveLength(2);
    }
  });

  it('keeps outcome card CSS tokenized', () => {
    const css = extractCssBlock(
      readFileSync(path.join(webRoot, cssPath), 'utf8'),
      'HOMEPAGE ARTIST OUTCOMES SYSTEM B'
    );

    for (const pattern of forbiddenCssPatterns) {
      expect(
        css.replaceAll('box-shadow: none;', ''),
        `${cssPath} leaked ${pattern}`
      ).not.toMatch(pattern);
    }

    expect(css).toContain('var(--system-b-app-frame-seam)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--system-b-primary-bg)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('var(--radius-2xl)');
    expect(css).toContain('aspect-ratio: 9 / 16');
    expect(css).toContain('--homepage-artist-outcome-copy-track: 1fr');
    expect(css).toContain('--homepage-artist-outcome-media-track: 2fr');
    expect(css).toContain('height: calc(100% - var(--space-4))');
    expect(css).not.toContain('transform: translateY(33%)');
    expect(css).toContain('object-fit: contain');
    expect(css).toContain('background: var(--system-b-bg-surface-0)');
    expect(css).toContain('box-shadow: none');
    expect(css).not.toContain('!important');
    expect(css).toContain('ap-phone-frame__overlay');
    expect(css).toContain('ap-phone-frame__notch');
    expect(css).toContain('@media (max-width: 767px)');
  });
});
