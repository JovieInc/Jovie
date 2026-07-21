import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const workspacePath = 'components/homepage/HomepageWorkspaceSection.tsx';
const workspaceLazyPath =
  'components/homepage/HomepageWorkspaceSectionLazy.tsx';
const cssPath = 'app/(home)/home.css';

const forbiddenWorkspaceSourcePatterns = [
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

const forbiddenWorkspaceCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /box-shadow:(?!\s*(?:none|var\())/,
  /letter-spacing:\s*-[^;]+/,
  /font-size:[^;]*vw/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractWorkspaceCss(source: string): string {
  const start = source.indexOf(
    'SYSTEM B MOUNTED HOME WORKSPACE SHELL PRIMITIVES'
  );
  const end = source.indexOf(
    'SYSTEM B MOUNTED HOME WORKSPACE SHELL PRIMITIVES END',
    start
  );

  expect(start, 'workspace CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'workspace CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('mounted homepage workspace System B source contract', () => {
  it('keeps loaded workspace markup on named System B primitives', () => {
    const source = readFileSync(path.join(webRoot, workspacePath), 'utf8');

    for (const pattern of forbiddenWorkspaceSourcePatterns) {
      expect(source, `${workspacePath} leaked ${pattern}`).not.toMatch(pattern);
    }

    for (const className of [
      'system-b-mounted-home-workspace',
      'system-b-mounted-home-workspace-inner',
      'system-b-mounted-home-workspace-copy',
      'system-b-mounted-home-workspace-headline',
      'system-b-mounted-home-workspace-visual',
      'system-b-mounted-home-workspace-media',
      'system-b-mounted-home-workspace-callouts',
      'system-b-mounted-home-workspace-callout',
      'system-b-mounted-home-workspace-callout-label',
      'system-b-mounted-home-workspace-callout-title',
      'system-b-mounted-home-workspace-callout-body',
    ]) {
      expect(source).toContain(className);
    }
  });

  it('keeps workspace placeholder markup on matching System B primitives', () => {
    const source = readFileSync(path.join(webRoot, workspaceLazyPath), 'utf8');

    for (const pattern of forbiddenWorkspaceSourcePatterns) {
      expect(source, `${workspaceLazyPath} leaked ${pattern}`).not.toMatch(
        pattern
      );
    }

    for (const className of [
      'system-b-mounted-home-workspace',
      'system-b-mounted-home-workspace-inner',
      'system-b-mounted-home-workspace-copy',
      'system-b-mounted-home-workspace-headline',
      'system-b-mounted-home-workspace-placeholder-heading',
      'system-b-mounted-home-workspace-visual',
    ]) {
      expect(source).toContain(className);
    }
  });

  it('keeps mounted workspace CSS tokenized and stable', () => {
    const css = extractWorkspaceCss(
      readFileSync(path.join(webRoot, cssPath), 'utf8')
    );

    for (const pattern of forbiddenWorkspaceCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('var(--system-b-bg-page)');
    expect(css).toContain('var(--system-b-app-frame-seam)');
    expect(css).toContain('var(--system-b-bg-surface-0)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--color-text-secondary-token)');
    expect(css).not.toContain('var(--color-text-tertiary-token)');
    // Content column: pinned to the shared homepage grid
    // (--ds-public-content-max inside --homepage-page-gutter gutters).
    expect(css).toContain('var(--ds-public-content-max)');
    expect(css).toContain('var(--homepage-page-gutter)');
    // Section title rides the shared marketing title ramp (fluid, so no
    // per-breakpoint font-size overrides live in this block).
    expect(css).toContain('var(--ds-marketing-title-size)');
    expect(css).toContain('var(--ds-marketing-title-leading)');
    expect(css).toContain('var(--ds-marketing-title-tracking)');
    // Numbered callouts use the eyebrow spec for the 01/02/03 numerals.
    expect(css).toContain('var(--ds-marketing-eyebrow-size)');
    expect(css).toContain('var(--ds-marketing-eyebrow-weight)');
    expect(css).toContain('var(--ds-marketing-eyebrow-tracking)');
    expect(css).toContain('var(--radius-xl)');
    expect(css).toContain('var(--text-lg)');
    expect(css).toContain('var(--text-sm)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('box-shadow: none;');
    expect(css).toContain('backdrop-filter: none;');
    expect(css).toContain('visibility: hidden;');
    expect(css).toContain('letter-spacing: 0;');
  });
});
