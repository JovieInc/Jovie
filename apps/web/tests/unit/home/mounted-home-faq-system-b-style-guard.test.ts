import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import postcss from 'postcss';
import { createElement } from 'react';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';
import { ClientFaqAccordion } from '@/components/marketing/ClientFaqAccordion';

const webRoot = path.resolve(__dirname, '../../..');
const faqSectionPath = 'components/marketing/FaqSection.tsx';
const faqAccordionPath = 'components/marketing/ClientFaqAccordion.tsx';
const cssPath = 'app/(home)/home.css';
const designSystemPath = 'styles/design-system.css';

// Shared marketing components keep their existing token utilities for other
// routes; the guard bans raw colors, gradients, shadows, and motion utilities
// everywhere, and arbitrary-value utilities on FaqSection itself. The shared
// accordion uses the native hidden contract so closed answers have no layout
// footprint. Expansion is direct and local to the declared FAQ boundary.
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

function extractFaqReducedMotionCss(source: string): string {
  const start = source.indexOf('FAQ REDUCED MOTION START');
  const end = source.indexOf('FAQ REDUCED MOTION END', start);

  expect(start, 'FAQ reduced-motion CSS block exists').toBeGreaterThanOrEqual(
    0
  );
  expect(end, 'FAQ reduced-motion CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('mounted homepage FAQ System B source contract', () => {
  it('emits a focus-only shadow and border transition on the actual FAQ trigger', async () => {
    render(
      createElement(ClientFaqAccordion, {
        items: [{ question: 'What is Jovie?', answer: 'An artist platform.' }],
      })
    );
    const trigger = screen.getByRole('button', { name: 'What is Jovie?' });
    const themes: string[] = [];
    postcss
      .parse(readFileSync(path.join(webRoot, 'app/globals.css'), 'utf8'))
      .walkAtRules('theme', rule => {
        themes.push(rule.toString());
      });
    const compiler = await compile(
      `${themes.join('\n')}\n@tailwind utilities;`
    );
    const output = postcss.parse(compiler.build([...trigger.classList]));
    const focusProperties: string[] = [];
    const idleProperties: string[] = [];
    const durations: string[] = [];
    output.walkRules(rule => {
      rule.walkDecls('transition-property', declaration => {
        if (rule.selector.endsWith(':focus-visible')) {
          focusProperties.push(declaration.value);
        } else if (rule.selector === '.transition-opacity') {
          idleProperties.push(declaration.value);
        }
      });
      if (rule.selector === '.duration-subtle') {
        rule.walkDecls('transition-duration', declaration => {
          durations.push(declaration.value);
        });
      }
    });

    // The base-layer focus rule loses to transition-opacity. Require the
    // actual mounted trigger to emit its own focus override, not merely name
    // a valid-looking utility or rely on the global rule still being present.
    expect(focusProperties, output.toString()).toEqual([
      'box-shadow,border-color',
    ]);
    expect(idleProperties).toEqual(['opacity']);
    expect(durations).toEqual(['var(--transition-duration-subtle)']);
    expect(themes.join('\n')).toContain(
      '--transition-duration-subtle: var(--duration-subtle)'
    );
  });

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

    expect(source).toContain('text-lg font-semibold leading-snug');
    expect(source).toContain('text-base leading-7 text-secondary-token');
    expect(source).toContain('hidden={!isOpen}');
    expect(source).toContain('aria-hidden={!isOpen}');
    expect(source).toContain(
      "className='faq-accordion__panel overflow-hidden'"
    );
    expect(source).not.toContain('grid-rows-[');
    expect(source).not.toMatch(
      /transition-\[[^\]]*(?:grid-template-rows|height|margin)/
    );
  });

  it('resolves FAQ motion immediately without changing the focus affordance', () => {
    const designSystem = readFileSync(
      path.join(webRoot, designSystemPath),
      'utf8'
    );
    const reducedMotion = extractFaqReducedMotionCss(designSystem);
    const focusRuleStart = designSystem.indexOf(':where(:focus-visible)');
    const reducedMotionStart = designSystem.indexOf('FAQ REDUCED MOTION START');
    const focusRule = designSystem.slice(focusRuleStart, reducedMotionStart);

    expect(focusRuleStart).toBeGreaterThanOrEqual(0);
    expect(reducedMotionStart).toBeGreaterThan(focusRuleStart);
    expect(focusRule).toContain('box-shadow:');
    expect(focusRule).toContain('box-shadow 150ms');
    expect(focusRule).toContain('border-color 150ms');
    expect(focusRule).not.toContain('transform');

    expect(reducedMotion).toContain(
      '[data-marketing-section="faq"][data-layout-contract="bounded-local-disclosure"]'
    );
    expect(reducedMotion).toContain('animation-duration: 0s !important');
    expect(reducedMotion).toContain('transition-duration: 0s !important');
    expect(reducedMotion).not.toContain('0.01ms');
    expect(reducedMotion).not.toContain('transform');
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
