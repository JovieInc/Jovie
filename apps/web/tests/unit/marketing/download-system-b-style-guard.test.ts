import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSourcePath = 'app/(marketing)/download/page.tsx';
const designSystemPath = 'styles/design-system.css';

const forbiddenRouteVisualPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /\b(?:bg|border|text|ring|shadow|decoration)-\[/,
  /\b(?:rounded|text|h|w|max-w|min-h|tracking|leading|px|py|pt|pb|z)-\[/,
  /\b(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|black|white)-(?:[0-9]|\[|\/)/,
] as const;
const forbiddenImportedDecorationPatterns = [
  /\bhomepage-hero(?:-[\w-]+|__[\w-]+)?\b/,
] as const;
const forbiddenStaticBypassPatterns = [
  /fetchLatestDesktopRelease/,
  /@\/lib\/desktop\/github-releases/,
  /async\s+function\s+DownloadPage/,
] as const;

const forbiddenDownloadCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /letter-spacing:\s*-[^;]+/,
  /font-size:\s*calc\(var\(--text-5xl\)\s*\+\s*var\(--space-16\)\)/,
  /color-mix\(in oklab,\s*(?:white|black)\b/,
  /(?:background|color|border(?:-[^:]+)?|box-shadow|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractDownloadCss(source: string): string {
  const start = source.indexOf(':where(.system-b-download-page)');
  const nextSectionMarkers = [
    '/* ============================================\n   SYSTEM B CHAT ENTITY PREVIEW PRIMITIVES',
    '/* ============================================\n   GEIST ACCENT PALETTE',
  ];
  const end = nextSectionMarkers
    .map(marker => source.indexOf(marker, start))
    .filter(index => index > start)
    .sort((a, b) => a - b)[0];

  expect(start, 'download CSS block exists').toBeGreaterThanOrEqual(0);
  expect(
    end,
    'download CSS block is bounded before the next section'
  ).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('download page System B source contract', () => {
  it('keeps download page visuals on named System B primitives', () => {
    const source = readFileSync(resolve(process.cwd(), pageSourcePath), 'utf8');

    for (const pattern of forbiddenRouteVisualPatterns) {
      expect(source, `${pageSourcePath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }
  });

  it('does not import homepage hero decoration into download', () => {
    const source = readFileSync(resolve(process.cwd(), pageSourcePath), 'utf8');

    for (const pattern of forbiddenImportedDecorationPatterns) {
      expect(source, `${pageSourcePath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }
  });

  it('keeps live desktop release lookup out of the static render path', () => {
    const source = readFileSync(resolve(process.cwd(), pageSourcePath), 'utf8');

    for (const pattern of forbiddenStaticBypassPatterns) {
      expect(source, `${pageSourcePath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }
  });

  it('keeps download System B CSS within stable tokenized bounds', () => {
    const source = extractDownloadCss(
      readFileSync(resolve(process.cwd(), designSystemPath), 'utf8')
    );

    for (const pattern of forbiddenDownloadCssPatterns) {
      expect(source, `${designSystemPath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }
  });
});
