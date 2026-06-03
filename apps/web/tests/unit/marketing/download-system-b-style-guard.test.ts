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
  const end = source.indexOf(
    '/* ============================================\n   GEIST ACCENT PALETTE',
    start
  );

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
