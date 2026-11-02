import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * (dynamic)/legal/* System B source contract.
 *
 * Part of the founder-directed System A -> System B marketing migration
 * (DESIGN.md 2026-06-18). Mirrors the shipped about/support/download guards.
 * Every file in this chain must carry no arbitrary Tailwind values,
 * hex/rgba/gradient colors, raw color scales, literal white/black utilities,
 * named shadow scales, inline styles, or System A editorial type classes.
 * Named System B token utilities only (any texture/accent gradient math
 * lives in `MarketingRouteHero.css`, which this guard does not scan, and is
 * itself checked by `design-system-source-ratchet.mjs`).
 *
 * 2026-10-29 marketing critic sweep: every legal route renders one shell
 * (legal-shell.tsx, from each route's own layout) with the full
 * docked MarketingHeader and expanded footer, and no route hero. The texture hero repeated the document title above the real
 * H1 over off-palette wallpaper; cookies/dmca ran a different header.
 */

const legalRoutes = ['privacy', 'terms', 'cookies', 'dmca'] as const;

const sharedSources = [
  'app/(dynamic)/legal/layout.tsx',
  'app/(dynamic)/legal/legal-shell.tsx',
  'app/(dynamic)/legal/privacy/page.tsx',
  'app/(dynamic)/legal/terms/page.tsx',
  'app/(dynamic)/legal/cookies/page.tsx',
  'app/(dynamic)/legal/dmca/page.tsx',
  'components/organisms/LegalPage.tsx',
  'components/site/PublicPageShell.tsx',
] as const;

const forbiddenVisualPatterns = [
  /style=\{/,
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /--linear-/,
  /\b(?:bg|border|text|ring|shadow|decoration)-\[/,
  /\b(?:rounded|text|h|w|max-w|min-h|tracking|leading|px|py|pt|pb|z)-\[/,
  /\b(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|blue|green|purple|pink|yellow|teal|lime|slate|gray|zinc|neutral|stone|black|white)-(?:[0-9]|\[|\/)/,
  /\b(?:bg|border|text|ring|shadow|decoration|from|via|to)-(?:white|black)(?:\/|\b)/,
  /\bshadow-(?:sm|md|lg|xl|2xl|inner)\b/,
  /\bmarketing-(?:h[1-6]|kicker|lead|body)-?linear\b|\bmarketing-kicker\b/,
] as const;

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('legal pages System B source contract', () => {
  it('keeps the legal chain visuals on named System B primitives', () => {
    for (const sourcePath of sharedSources) {
      const source = readSource(sourcePath);
      for (const pattern of forbiddenVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('gives every legal route one shell: full header, expanded footer, no hero', () => {
    const layout = readSource('app/(dynamic)/legal/legal-shell.tsx');

    expect(layout).toContain('<PublicPageShell');
    expect(layout).not.toContain("headerVariant='minimal'");
    expect(layout).toContain("footerVariant='expanded'");
    expect(layout).not.toContain('mainOffset={false}');
    expect(layout).toContain("className='public-legal-content py-16 sm:py-20'");
    for (const heroResidue of [
      'MarketingHero',
      'marketing-route-hero',
      'MarketingRouteHero.css',
      '<Image',
      '/images/hero/',
    ]) {
      expect(layout).not.toContain(heroResidue);
    }
    // Per-route layouts render the one shell; hoisting it into the segment
    // layout regrouped client chunks past the /demo and /p/[token] budgets.
    for (const route of legalRoutes) {
      const routeLayout = readSource(`app/(dynamic)/legal/${route}/layout.tsx`);
      expect(routeLayout, `${route} must render LegalDocumentShell`).toContain(
        '<LegalDocumentShell>'
      );
      expect(routeLayout).not.toContain('<PublicPageShell');
    }
  });

  it('keeps every legal page rendering the shared LegalPage organism', () => {
    for (const pagePath of [
      'app/(dynamic)/legal/privacy/page.tsx',
      'app/(dynamic)/legal/terms/page.tsx',
      'app/(dynamic)/legal/cookies/page.tsx',
      'app/(dynamic)/legal/dmca/page.tsx',
    ]) {
      const page = readSource(pagePath);
      expect(page, `${pagePath} must render LegalPage`).toContain('<LegalPage');
    }
  });
});
