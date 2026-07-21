import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSourcePath = 'app/brand/page.tsx';
const layoutSourcePath = 'app/brand/layout.tsx';
const designSystemPath = 'styles/design-system.css';

const forbiddenRouteVisualPatterns = [
  /style=\{/,
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /--linear-/,
  /\b(?:bg|border|text|ring|shadow|decoration)-\[/,
  /\b(?:rounded|text|h|w|max-w|min-h|tracking|leading|px|py|pt|pb|z)-\[/,
  /\b(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|black|white)-(?:[0-9]|\[|\/)/,
  /[☰☷✉■☆✓×▶□]/,
  /&#(?:10024|9634|9654|9679);/,
] as const;

const forbiddenBrandCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /--linear-/,
  /--space-(?:7|9|14|28|32)\b/,
  /--text-(?:6xl|7xl|8xl)\b/,
  /font-size:[^;]*\bvw\b/,
  /color-mix\(in oklab,\s*(?:white|black)\b/,
  /(?:background|color|border(?:-[^:]+)?|box-shadow|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractBrandCss(source: string): string {
  const start = source.indexOf(':where(.system-b-brand-layout)');
  const nextSectionMarkers = [
    '/* ============================================\n   SYSTEM B CHAT ENTITY PREVIEW PRIMITIVES',
    '/* ============================================\n   GEIST ACCENT PALETTE',
  ];
  const end = nextSectionMarkers
    .map(marker => source.indexOf(marker, start))
    .filter(index => index > start)
    .sort((a, b) => a - b)[0];

  expect(start, 'brand CSS block exists').toBeGreaterThanOrEqual(0);
  expect(
    end,
    'brand CSS block is bounded before the next section'
  ).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('brand page System B source contract', () => {
  it('renders /brand on the System B marketing wrapper, not System A', () => {
    const layout = readFileSync(
      resolve(process.cwd(), layoutSourcePath),
      'utf8'
    );
    expect(layout).toContain('system-b-marketing dark');
    expect(layout).not.toContain('linear-marketing');
  });

  it('keeps brand route visuals on named System B primitives', () => {
    const sources = [
      [
        pageSourcePath,
        readFileSync(resolve(process.cwd(), pageSourcePath), 'utf8'),
      ],
      [
        layoutSourcePath,
        readFileSync(resolve(process.cwd(), layoutSourcePath), 'utf8'),
      ],
    ] as const;

    for (const [sourcePath, source] of sources) {
      for (const pattern of forbiddenRouteVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps exactly one page-level primary action on brand', () => {
    const source = readFileSync(resolve(process.cwd(), pageSourcePath), 'utf8');

    expect(source.match(/data-primary-action='true'/g) ?? []).toHaveLength(1);
    expect(
      source,
      `${pageSourcePath} should not use global primary CTAs`
    ).not.toMatch(/public-action-primary/);
  });

  it('keeps brand System B CSS within stable tokenized bounds', () => {
    const source = extractBrandCss(
      readFileSync(resolve(process.cwd(), designSystemPath), 'utf8')
    );

    for (const pattern of forbiddenBrandCssPatterns) {
      expect(source, `${designSystemPath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }

    for (const declaration of source.match(/letter-spacing:\s*[^;]+;/g) ?? []) {
      expect(declaration).toMatch(/letter-spacing:\s*0\s*;/);
    }
  });
});
