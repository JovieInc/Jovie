import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const pagePath = 'app/(home)/page.tsx';
const cssPath = 'app/(home)/home.css';

const forbiddenProductStatementSourcePatterns = [
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

const forbiddenProductStatementCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /box-shadow:/,
  /letter-spacing:\s*-[^;]+/,
  /font-size:[^;]*vw/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractProductStatementCss(source: string): string {
  const start = source.indexOf(
    'SYSTEM B MOUNTED HOME PRODUCT STATEMENT PRIMITIVES'
  );
  const end = source.indexOf(
    'SYSTEM B MOUNTED HOME PRODUCT STATEMENT PRIMITIVES END',
    start
  );

  expect(start, 'product statement CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'product statement CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

function extractProductStatementSource(source: string): string {
  const start = source.indexOf('function HomepageProductStatement');
  const end = source.indexOf('function HomepageGoLiveStepsSection', start);

  expect(start, 'product statement source exists').toBeGreaterThanOrEqual(0);
  expect(end, 'product statement source is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('mounted homepage product statement System B source contract', () => {
  it('keeps mounted product statement markup on named System B primitives', () => {
    const source = extractProductStatementSource(
      readFileSync(path.join(webRoot, pagePath), 'utf8')
    );

    for (const pattern of forbiddenProductStatementSourcePatterns) {
      expect(source, `${pagePath} leaked ${pattern}`).not.toMatch(pattern);
    }

    for (const className of [
      'system-b-mounted-home-product-statement',
      'system-b-mounted-home-product-statement-inner',
      'system-b-mounted-home-product-statement-eyebrow',
      'system-b-mounted-home-product-statement-headline',
      'system-b-mounted-home-product-statement-lead',
      'system-b-mounted-home-product-statement-body',
      'system-b-mounted-home-product-statement-ai',
      'system-b-mounted-home-product-statement-ai-copy',
    ]) {
      expect(source).toContain(className);
    }
  });

  it('keeps mounted product statement CSS tokenized and stable', () => {
    const css = extractProductStatementCss(
      readFileSync(path.join(webRoot, cssPath), 'utf8')
    );

    for (const pattern of forbiddenProductStatementCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('var(--system-b-bg-page)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--color-text-secondary-token)');
    expect(css).toContain('var(--color-text-tertiary-token)');
    expect(css).toContain('var(--text-5xl)');
    expect(css).toContain('var(--text-4xl)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('display: none;');
    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toContain('letter-spacing: 0;');
  });
});
