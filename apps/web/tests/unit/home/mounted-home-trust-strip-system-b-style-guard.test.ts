import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const trustPath = 'components/features/home/HomeTrustSection.tsx';
const cssPath = 'app/(home)/home.css';

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
});
