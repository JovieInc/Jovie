import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const faqSectionPath = 'components/marketing/FaqSection.tsx';
const faqAccordionPath = 'components/marketing/ClientFaqAccordion.tsx';
const cssPath = 'app/(home)/home.css';

// Shared marketing components keep their existing token utilities for other
// routes; the guard bans raw colors, gradients, shadows, and motion utilities
// everywhere, and arbitrary-value utilities on FaqSection itself. The shared
// accordion's pre-existing arbitrary values (leading-[1.35], grid-rows-[1fr],
// transition-[...]) are the accordion's open/close mechanics and stay until the
// coordinated shared-component teardown (see compare-system-b-style-guard).
const forbiddenFaqSourcePatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /\btext-white(?:\/|\b)/,
  /\b(?:white|black|blue|violet|sky|cyan|pink|fuchsia|emerald|amber|orange|rose|red)-(?:[0-9]|\[|\/)/,
  /\bshadow-(?:sm|md|lg|xl|2xl|inner|\[)/,
  /\b(?:transition-all|transition-transform|hover:brightness|hover:scale|hover:translate|hover:-translate|group-hover:scale|group-hover:translate|group-hover:-translate)\b/,
] as const;

const forbiddenFaqSectionSourcePatterns = [
  ...forbiddenFaqSourcePatterns,
  /\b(?:bg|border|text|ring|shadow|rounded|h|w|max-w|min-h|tracking|leading|px|py|pt|pb|z)-\[/,
] as const;

const forbiddenFaqCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /box-shadow:(?!\s*(?:none|var\())/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractMountedFaqCss(source: string): string {
  const start = source.indexOf('HOMEPAGE FAQ SYSTEM B START');
  const end = source.indexOf('HOMEPAGE FAQ SYSTEM B END', start);

  expect(start, 'mounted FAQ CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'mounted FAQ CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('mounted homepage FAQ System B source contract', () => {
  it('keeps the shared FaqSection on named System B primitives', () => {
    const source = readFileSync(path.join(webRoot, faqSectionPath), 'utf8');

    for (const pattern of forbiddenFaqSectionSourcePatterns) {
      expect(source, `${faqSectionPath} leaked ${pattern}`).not.toMatch(
        pattern
      );
    }

    // Backward-compatible structural hooks the homepage wrapper styles.
    expect(source).toContain('faq-section');
    expect(source).toContain('faq-section__heading');
  });

  it('keeps the shared FAQ accordion free of raw color and motion utilities', () => {
    const source = readFileSync(path.join(webRoot, faqAccordionPath), 'utf8');

    for (const pattern of forbiddenFaqSourcePatterns) {
      expect(source, `${faqAccordionPath} leaked ${pattern}`).not.toMatch(
        pattern
      );
    }

    for (const className of [
      'faq-accordion',
      'faq-accordion__item',
      'faq-accordion__trigger',
      'faq-accordion__icon',
      'faq-accordion__panel',
      'faq-accordion__answer',
    ]) {
      expect(source).toContain(className);
    }
  });

  it('keeps mounted FAQ shell CSS tokenized and grid-aligned', () => {
    const css = extractMountedFaqCss(
      readFileSync(path.join(webRoot, cssPath), 'utf8')
    );

    for (const pattern of forbiddenFaqCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('var(--system-b-bg-page)');
    expect(css).toContain('var(--system-b-app-frame-seam)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--color-text-secondary-token)');
    expect(css).toContain('var(--ds-public-content-max)');
    expect(css).toContain('var(--homepage-page-gutter)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('var(--font-sans)');
    expect(css).toContain('width: min(');
    expect(css).toContain('@media (max-width: 767px)');
  });
});
