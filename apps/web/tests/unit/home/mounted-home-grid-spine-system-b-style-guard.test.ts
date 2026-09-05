import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const pagePath = 'app/(home)/page.tsx';
const cssPath = 'app/(home)/home.css';
const headerCssPath = 'components/organisms/HeaderNav.css';

const forbiddenPageChromePatterns = [
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

const forbiddenSpineCssPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /background(?:-image)?:[^;]*(?:linear-gradient|radial-gradient)/,
  /box-shadow:/,
  /(?:background|color|border(?:-[^:]+)?|text-decoration-color):[^;]*(?<!-)\b(?:white|black)\b/,
] as const;

function extractGridSpineCss(source: string): string {
  const start = source.indexOf('HOMEPAGE GRID SPINE SYSTEM B START');
  const end = source.indexOf('HOMEPAGE GRID SPINE SYSTEM B END', start);

  expect(start, 'grid spine CSS block exists').toBeGreaterThanOrEqual(0);
  expect(end, 'grid spine CSS block is bounded').toBeGreaterThan(start);

  return source.slice(start, end);
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe('mounted homepage grid spine System B source contract', () => {
  it('keeps page-level markup free of forbidden style patterns', () => {
    const pageSource = readFileSync(path.join(webRoot, pagePath), 'utf8');

    for (const pattern of forbiddenPageChromePatterns) {
      expect(pageSource, `${pagePath} leaked ${pattern}`).not.toMatch(pattern);
    }

    // The hero guard slices page.tsx between these two anchors; they must
    // survive any page-spine edit verbatim.
    expect(pageSource).toContain('function HomepageHero()');
    expect(pageSource).toContain('function HomepageUnlockedSections()');
    expect(pageSource.indexOf('function HomepageHero()')).toBeLessThan(
      pageSource.indexOf('function HomepageUnlockedSections()')
    );

    // Page-level wrappers stay neutral: sections mount through named shells,
    // never through ad-hoc sizing utilities in page markup.
    expect(pageSource).toContain('homepage-story-stack');
    // Certified homepage: proof is a statement, never a logo strip.
    expect(pageSource).not.toContain('HomeTrustSection');
    expect(pageSource).not.toContain('FaqSection');
  });

  it('mounts each homepage section exactly once', () => {
    const pageSource = readFileSync(path.join(webRoot, pagePath), 'utf8');

    for (const mount of [
      '<HomepageEditorialHero',
      '<HomepageCertifiedSections',
      '<HomepageClose',
    ]) {
      expect(
        countOccurrences(pageSource, mount),
        `${pagePath} must mount ${mount} exactly once`
      ).toBe(1);
    }

    expect(
      countOccurrences(pageSource, "data-testid='homepage-story-stack'")
    ).toBe(1);

    expect(pageSource).not.toContain('MarketingShippedSitesShowcase');
    expect(pageSource).not.toContain('MarketingPlatformSpecBento');
    expect(pageSource).not.toContain('homepage-shipped-sites-showcase');
    expect(pageSource).not.toContain('homepage-platform-spec-bento');
  });

  it('locks the page-level CSS spine onto the shared content column', () => {
    const cssSource = readFileSync(path.join(webRoot, cssPath), 'utf8');
    const headerCssSource = readFileSync(
      path.join(webRoot, headerCssPath),
      'utf8'
    );
    const spine = extractGridSpineCss(cssSource);

    for (const pattern of forbiddenSpineCssPatterns) {
      expect(spine, `${cssPath} spine leaked ${pattern}`).not.toMatch(pattern);
    }

    // The glass header owns the page's visible content edges. Its shell
    // geometry is shared with the homepage without changing the global
    // canonical public-content width.
    expect(headerCssSource).toContain('--marketing-glass-shell-max: 90rem;');
    expect(headerCssSource).toContain(
      '--marketing-glass-shell-padding-inline: clamp(1.35rem, 2.3vw, 2rem);'
    );
    expect(headerCssSource).toContain(
      '--marketing-glass-shell-border-width: var(--space-px);'
    );
    expect(headerCssSource).toContain('--marketing-glass-content-max: calc(');
    expect(headerCssSource).toContain(
      '--marketing-glass-content-gutter: calc('
    );
    expect(headerCssSource).toMatch(
      /@media \(max-width: 767px\)[\s\S]*--marketing-glass-gutter: 1rem;[\s\S]*--marketing-glass-shell-padding-inline: 0\.82rem;/
    );

    // The spine consumes the header-derived content column, not a second
    // approximation of its gutter or max-width.
    expect(spine).toContain(
      '--homepage-grid-max: var(--marketing-glass-content-max);'
    );
    expect(spine).toContain(
      '--homepage-grid-gutter: var(--marketing-glass-content-gutter);'
    );
    expect(cssSource).toMatch(
      /\.homepage-editorial-hero__copy \{[\s\S]*?min-width: 0;/
    );

    // The canonical gutter is tokenized on the space scale — one gutter for
    // header, hero, and every story-stack chapter at every breakpoint.
    expect(cssSource).toContain(
      '--homepage-page-gutter: clamp(var(--space-5), 2.2vw, var(--space-8));'
    );

    // No divergent chapter gutter may survive anywhere on the page: every
    // grid-gutter declaration resolves to the shared header content gutter.
    const gutterDeclarations =
      cssSource.match(/--homepage-grid-gutter:[^;]+;/g) ?? [];
    expect(gutterDeclarations.length).toBeGreaterThan(0);
    for (const declaration of gutterDeclarations) {
      expect(declaration).toBe(
        '--homepage-grid-gutter: var(--marketing-glass-content-gutter);'
      );
    }

    const maxDeclarations =
      cssSource.match(/--homepage-grid-max:[^;]+;/g) ?? [];
    expect(maxDeclarations.length).toBeGreaterThan(0);
    for (const declaration of maxDeclarations) {
      expect(declaration).toBe(
        '--homepage-grid-max: var(--marketing-glass-content-max);'
      );
    }
  });
});
