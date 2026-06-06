import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const sourcePath = 'components/features/home/HomeProfileShowcase.tsx';
const cssPath = 'styles/design-system.css';

const forbiddenShowcaseSourcePatterns = [
  /\btext-\[[^\]]+\]/,
  /\bfont-\[[^\]]+\]/,
  /\btracking-\[[^\]]+\]/,
  /\brounded-\[[^\]]+\]/,
  /\bbg-white\//,
  /\bbg-black\/96\b/,
  /\btext-(?:sky|emerald|slate)-/,
  /\bmax-w-\[853px\]/,
] as const;

const forbiddenShowcaseCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /letter-spacing:\s*-[^;]+/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractHomeProfileShowcaseCss(source: string): string {
  const start = source.indexOf('SYSTEM B HOME PROFILE SHOWCASE PRIMITIVES');
  const end = source.indexOf(
    'SYSTEM B HOME PROFILE SHOWCASE PRIMITIVES END',
    start
  );

  expect(start, 'HomeProfileShowcase CSS block exists').toBeGreaterThanOrEqual(
    0
  );
  expect(end, 'HomeProfileShowcase CSS block is bounded').toBeGreaterThan(
    start
  );

  return source.slice(start, end);
}

describe('HomeProfileShowcase System B source contract', () => {
  it('keeps overlay and reference chrome on named System B primitives', () => {
    const source = readFileSync(path.join(webRoot, sourcePath), 'utf8');

    for (const pattern of forbiddenShowcaseSourcePatterns) {
      expect(source, `${sourcePath} leaked ${pattern}`).not.toMatch(pattern);
    }

    for (const className of [
      'homepage-showcase-reference',
      'homepage-showcase-reference-image',
      'homepage-showcase-crop-viewport',
      'homepage-showcase-crop-surface',
      'homepage-showcase-overlay-row',
      'homepage-showcase-overlay-title',
      'homepage-showcase-overlay-headline',
      'homepage-showcase-overlay-body',
      'homepage-showcase-overlay-badge',
      'homepage-showcase-overlay-meta-row',
    ]) {
      expect(source).toContain(className);
    }

    expect(source).toContain('data-presentation={presentation}');
    expect(source).toContain('data-overlay-mode={overlayMode}');
    expect(source).toContain('data-crop-anchor={cropAnchor}');
    expect(source).toContain("aria-hidden='true'");
    expect(source).toContain('inert');
  });

  it('keeps HomeProfileShowcase CSS tokenized and grayscale-first', () => {
    const css = extractHomeProfileShowcaseCss(
      readFileSync(path.join(webRoot, cssPath), 'utf8')
    );

    for (const pattern of forbiddenShowcaseCssPatterns) {
      expect(css, `${cssPath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(css).toContain('var(--system-b-cinematic-black)');
    expect(css).toContain('var(--system-b-bg-surface-1)');
    expect(css).toContain('var(--system-b-app-frame-seam)');
    expect(css).toContain('var(--color-text-primary-token)');
    expect(css).toContain('var(--color-success)');
    expect(css).toContain('var(--color-info)');
    expect(css).toContain('var(--space-');
    expect(css).toContain('var(--profile-card-radius)');
    expect(css).toContain('letter-spacing: var(--tracking-normal);');
    expect(css).toContain('aspect-ratio: 430 / 950;');
  });
});
