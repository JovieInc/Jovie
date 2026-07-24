import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const closedLoopComponentPath = 'components/homepage/HomepageClosedLoop.tsx';
const cssPath = 'app/(home)/home.css';

const forbiddenClosedLoopSourcePatterns = [
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

const forbiddenClosedLoopCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /background(?:-image)?:[^;]*(?:linear-gradient|radial-gradient)/,
  /box-shadow:/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractClosedLoopCss(source: string): string {
  const start = source.indexOf('HOMEPAGE CLOSED LOOP SYSTEM B START');
  const end = source.indexOf('HOMEPAGE CLOSED LOOP SYSTEM B END', start);

  expect(start, 'closed loop CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'closed loop CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('mounted homepage closed loop System B source contract', () => {
  it('keeps closed loop markup on named System B primitives', () => {
    const source = readFileSync(
      path.join(webRoot, closedLoopComponentPath),
      'utf8'
    );

    for (const pattern of forbiddenClosedLoopSourcePatterns) {
      expect(
        source,
        `${closedLoopComponentPath} leaked ${pattern}`
      ).not.toMatch(pattern);
    }

    for (const className of [
      'homepage-closed-loop-section',
      'homepage-closed-loop-inner',
      'homepage-closed-loop-copy',
      'homepage-closed-loop-headline',
      'homepage-closed-loop-story',
      'homepage-closed-loop-visual',
      'homepage-closed-loop-visual-svg',
      'homepage-closed-loop-visual-caption',
      'homepage-closed-loop-sequence',
      'homepage-closed-loop-step',
      'homepage-closed-loop-step-marker',
      'homepage-closed-loop-step-copy',
      'homepage-closed-loop-step-title',
      'homepage-closed-loop-step-description',
    ]) {
      expect(source).toContain(className);
    }
  });

  it('keeps closed loop CSS tokenized and locked to the homepage grid', () => {
    const css = extractClosedLoopCss(
      readFileSync(path.join(webRoot, cssPath), 'utf8')
    );

    for (const pattern of forbiddenClosedLoopCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('var(--system-b-bg-page)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--color-text-secondary-token)');
    expect(css).toContain('var(--color-text-tertiary-token)');
    expect(css).toContain('var(--ds-public-content-max)');
    expect(css).toContain('var(--homepage-page-gutter)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('var(--font-sans)');
    expect(css).toContain('grid-template-columns: repeat(12, minmax(0, 1fr));');
    expect(css).toContain('@media (max-width: 767px)');
  });
});
