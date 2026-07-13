import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const commandCenterPath = 'components/homepage/HomepageHeroCommandCenter.tsx';
const cssPath = 'app/(home)/home.css';

const forbiddenCommandCenterSourcePatterns = [
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

const forbiddenCommandCenterCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /box-shadow:(?!\s*(?:none|var\())/,
  /letter-spacing:\s*-[^;]+/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractCommandCenterCss(source: string): string {
  const start = source.indexOf(
    'SYSTEM B MOUNTED HOME COMMAND CENTER PRIMITIVES'
  );
  const end = source.indexOf(
    'SYSTEM B MOUNTED HOME COMMAND CENTER PRIMITIVES END',
    start
  );

  expect(start, 'command center CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'command center CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

function extractCommandCenterSource(source: string): string {
  const start = source.indexOf('function ProductPane');
  const end = source.length;

  expect(start, 'command center source exists').toBeGreaterThanOrEqual(0);
  return source.slice(start, end);
}

describe('mounted homepage command center System B source contract', () => {
  it('keeps mounted command center markup on named System B primitives', () => {
    const source = extractCommandCenterSource(
      readFileSync(path.join(webRoot, commandCenterPath), 'utf8')
    );

    for (const pattern of forbiddenCommandCenterSourcePatterns) {
      expect(source, `${commandCenterPath} leaked ${pattern}`).not.toMatch(
        pattern
      );
    }

    for (const className of [
      'system-b-mounted-home-command-center',
      'system-b-mounted-home-command-rail',
      'system-b-mounted-home-command-pane',
    ]) {
      expect(source).toContain(className);
    }
  });

  it('keeps mounted command center CSS tokenized and stable', () => {
    const css = extractCommandCenterCss(
      readFileSync(path.join(webRoot, cssPath), 'utf8')
    );

    for (const pattern of forbiddenCommandCenterCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('var(--system-b-app-frame-seam)');
    expect(css).toContain('var(--system-b-bg-page)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--radius-xl)');
    expect(css).toContain('display: none;');
  });
});
