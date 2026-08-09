import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const trustPath = 'components/features/home/HomeTrustSection.tsx';
const cssPath = 'app/(home)/home.css';
const pagePath = 'app/(home)/page.tsx';
const storyPath =
  'components/marketing/storybook/MarketingSections.stories.tsx';
const sectionRegistryPath = 'data/marketing/sections.ts';
const variantRegistryPath = 'lib/sections/variants/logo-bar.tsx';

const forbiddenTrustStripCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /box-shadow:/,
  /letter-spacing:\s*-[^;]+/,
  /font-size:[^;]*vw/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractTrustStripCss(source: string): string {
  const start = source.indexOf('SYSTEM B MOUNTED HOME TRUST STRIP PRIMITIVES');
  const end = source.indexOf(
    'SYSTEM B MOUNTED HOME TRUST STRIP PRIMITIVES END',
    start
  );

  expect(start, 'trust strip CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'trust strip CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('mounted homepage trust strip System B source contract', () => {
  it('keeps mounted trust strip markup on named System B primitives', () => {
    const trustSource = readFileSync(path.join(webRoot, trustPath), 'utf8');

    for (const className of [
      'system-b-mounted-home-trust-strip',
      'system-b-mounted-home-trust-strip-inner',
      'system-b-mounted-home-trust-strip-label',
      'system-b-mounted-home-trust-strip-logo-grid',
      'system-b-mounted-home-trust-strip-logo-slot',
      'system-b-mounted-home-trust-strip-logo',
      'system-b-mounted-home-trust-strip-logo--awal',
      'system-b-mounted-home-trust-strip-logo--orchard',
      'system-b-mounted-home-trust-strip-logo--umg',
      'system-b-mounted-home-trust-strip-logo--armada',
      'system-b-mounted-home-trust-strip-logo--black-hole',
    ]) {
      expect(trustSource).toContain(className);
    }

    for (const className of [
      'homepage-trust-proof-moment',
      'homepage-trust-proof-moment__inner',
      'homepage-trust-proof-moment__copy',
      'homepage-trust-proof-moment__eyebrow',
      'homepage-trust-proof-moment__headline',
      'homepage-trust-proof-moment__logo-grid',
      'homepage-trust-proof-moment__logo-slot',
      'homepage-trust-proof-moment__logo',
    ]) {
      expect(trustSource).toContain(className);
    }
  });

  it('keeps mounted trust strip CSS tokenized and stable', () => {
    const css = extractTrustStripCss(
      readFileSync(path.join(webRoot, cssPath), 'utf8')
    );

    for (const pattern of forbiddenTrustStripCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('var(--system-b-bg-page)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--color-text-tertiary-token)');
    // Content column: the strip locks onto the shared homepage grid
    // (--ds-public-content-max inside --homepage-page-gutter gutters), not
    // the legacy 90rem --homepage-section-max.
    expect(css).toContain('var(--ds-public-content-max)');
    expect(css).not.toContain('var(--homepage-section-max)');
    expect(css).toContain('var(--homepage-page-gutter)');
    // Label rides the shared marketing eyebrow tokens (quiet label rhythm).
    expect(css).toContain('font-size: var(--ds-marketing-eyebrow-size);');
    expect(css).toContain('font-weight: var(--ds-marketing-eyebrow-weight);');
    expect(css).toContain('line-height: var(--ds-marketing-eyebrow-leading);');
    expect(css).toContain(
      'letter-spacing: var(--ds-marketing-eyebrow-tracking);'
    );
    // Section rhythm: padding derives from the shared chapter space token.
    expect(css).toContain('var(--homepage-chapter-space)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('filter: grayscale(1);');
    expect(css).toContain(
      '.system-b-mounted-home-trust-strip-shell\n' +
        '  > .system-b-mounted-home-trust-strip[data-presentation="inline-strip"]\n' +
        '  > .system-b-mounted-home-trust-strip-inner'
    );
    expect(css).toContain('padding-inline: 0;');
    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toMatch(
      /\.system-b-mounted-home-trust-strip \.system-b-mounted-home-trust-strip-label\s*\{[^}]*color: var\(--ds-marketing-eyebrow-color\)/
    );
    expect(css).not.toMatch(
      /\.system-b-mounted-home-trust-strip \.system-b-mounted-home-trust-strip-label\s*\{[^}]*color: var\(--color-text-quaternary-token\)/
    );
  });

  it('registers and mounts one canonical proof-moment presentation', () => {
    const page = readFileSync(path.join(webRoot, pagePath), 'utf8');
    const story = readFileSync(path.join(webRoot, storyPath), 'utf8');
    const sections = readFileSync(
      path.join(webRoot, sectionRegistryPath),
      'utf8'
    );
    const variants = readFileSync(
      path.join(webRoot, variantRegistryPath),
      'utf8'
    );

    expect(page).toContain("<HomeTrustSection presentation='proof-moment' />");
    expect(story).toContain("<HomeTrustSection presentation='proof-moment' />");
    expect(sections).toContain("id: 'proof-moment'");
    expect(variants).toContain("id: 'home-trust-proof-moment'");
    expect(variants).toContain("presentation='proof-moment'");
  });

  it('keeps proof-moment geometry, palette, and motion on canonical tokens', () => {
    const css = extractTrustStripCss(
      readFileSync(path.join(webRoot, cssPath), 'utf8')
    );

    expect(css).toContain('min-height: 31rem;');
    expect(css).toContain('min-height: 36.5rem;');
    expect(css).toContain(
      'padding: var(--space-16) var(--space-10) var(--space-12);'
    );
    expect(css).toContain(
      'padding: calc(var(--space-12) + var(--space-1)) var(--space-6)'
    );
    expect(css).toContain('max-width: 41.25rem;');
    expect(css).toContain('max-width: 21.375rem;');
    expect(css).toContain('font-size: var(--text-5xl);');
    expect(css).toContain('font-size: calc(var(--text-4xl) + var(--space-1));');
    expect(css).toContain('line-height: 1.04;');
    expect(css).toContain('line-height: 1.02;');
    expect(css).toContain('var(--system-b-bg-page)');
    expect(css).toContain('var(--system-b-bg-surface-0)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--color-text-tertiary-token)');
    expect(css).toContain('var(--color-border-subtle)');
    expect(css).toContain('var(--ds-motion-cinematic-duration)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none;');
    expect(css).toContain('transform: none;');
    expect(css).not.toContain('animation-timeline:');
  });
});
