import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSourcePath = 'app/(marketing)/launch/page.tsx';
const designSystemPath = 'styles/design-system.css';
const launchVisibleSourcePaths = [
  pageSourcePath,
  'components/features/home/ProfileMockup.tsx',
  'components/features/home/AiDemo.tsx',
] as const;

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

const forbiddenImportedDemoVisualPatterns = [
  /style=\{/,
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /\btransition-all\b/,
  /transform:\s*/,
  /translate(?:3d|X|Y)?\(/,
  /<svg\b|<path\b|<rect\b/,
  /[☰☷✉■☆✓×▶□]/,
] as const;

const forbiddenLaunchCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /--linear-/,
  /letter-spacing:\s*-[^;]+/,
  /color-mix\(in oklab,\s*(?:white|black)\b/,
  /(?:background|color|border(?:-[^:]+)?|box-shadow|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractLaunchCss(source: string): string {
  const start = source.indexOf(':where(.system-b-launch-page)');
  const nextSectionMarkers = [
    '/* ============================================\n   SYSTEM B PRICING PAGE',
    '/* ============================================\n   SYSTEM B CHAT ENTITY PREVIEW PRIMITIVES',
    '/* ============================================\n   GEIST ACCENT PALETTE',
  ];
  const end = nextSectionMarkers
    .map(marker => source.indexOf(marker, start))
    .filter(index => index > start)
    .sort((a, b) => a - b)[0];

  expect(start, 'launch CSS block exists').toBeGreaterThanOrEqual(0);
  expect(
    end,
    'launch CSS block is bounded before the next section'
  ).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('launch page System B source contract', () => {
  it('keeps launch page visuals on named System B primitives', () => {
    const source = readFileSync(resolve(process.cwd(), pageSourcePath), 'utf8');

    for (const pattern of forbiddenRouteVisualPatterns) {
      expect(source, `${pageSourcePath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }
  });

  it('keeps launch-visible imported demos on the same System B guardrails', () => {
    for (const sourcePath of launchVisibleSourcePaths) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');

      for (const pattern of forbiddenImportedDemoVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps launch System B CSS within stable tokenized bounds', () => {
    const source = extractLaunchCss(
      readFileSync(resolve(process.cwd(), designSystemPath), 'utf8')
    );

    for (const pattern of forbiddenLaunchCssPatterns) {
      expect(source, `${designSystemPath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }
  });
});
