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
 * As of the 2026-09-26 marketing routes pass (Tim direction), /legal/privacy
 * and /legal/terms moved off the shared minimal shell onto their own
 * per-route layout with the full docked MarketingHeader and a route hero;
 * /legal/cookies and /legal/dmca keep the original minimal shell, now on
 * their own sibling layout files instead of the shared parent.
 */

const sharedSources = [
  'app/(dynamic)/legal/layout.tsx',
  'app/(dynamic)/legal/cookies/layout.tsx',
  'app/(dynamic)/legal/dmca/layout.tsx',
  'app/(dynamic)/legal/privacy/layout.tsx',
  'app/(dynamic)/legal/terms/layout.tsx',
  'app/(dynamic)/legal/privacy/page.tsx',
  'app/(dynamic)/legal/terms/page.tsx',
  'app/(dynamic)/legal/cookies/page.tsx',
  'app/(dynamic)/legal/dmca/page.tsx',
  'components/organisms/LegalPage.tsx',
  'components/site/PublicPageShell.tsx',
] as const;

const minimalShellSources = [
  'app/(dynamic)/legal/cookies/layout.tsx',
  'app/(dynamic)/legal/dmca/layout.tsx',
] as const;

const heroShellSources = [
  'app/(dynamic)/legal/privacy/layout.tsx',
  'app/(dynamic)/legal/terms/layout.tsx',
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

  it('keeps /legal/cookies and /legal/dmca on the minimal PublicPageShell', () => {
    for (const sourcePath of minimalShellSources) {
      const layout = readSource(sourcePath);

      expect(layout).toContain('<PublicPageShell');
      expect(layout).toContain("headerVariant='minimal'");
      expect(layout).toContain('MarketingContainer');
      expect(layout).toContain('text-primary-token');
      expect(layout).not.toContain('mainOffset={false}');
      expect(layout).not.toContain('mainClassName=');
      expect(layout).toContain(
        "className='public-legal-content py-16 sm:py-20'"
      );
    }
  });

  it('gives /legal/privacy and /legal/terms the full docked header, a route hero, and the full footer', () => {
    for (const sourcePath of heroShellSources) {
      const layout = readSource(sourcePath);

      expect(layout).toContain('<PublicPageShell');
      // The full/docked MarketingHeader is PublicPageShell's default variant;
      // these routes must not opt back into the minimal variant.
      expect(layout).not.toContain("headerVariant='minimal'");
      expect(layout).toContain("footerVariant='expanded'");
      expect(layout).toContain('marketing-hero-dock');
      expect(layout).toContain('marketing-route-hero__media');
      expect(layout).toContain('MarketingRouteHero.css');
      expect(layout).toContain(
        "className='public-legal-content py-16 sm:py-20'"
      );
    }
  });

  it('gives /legal/privacy and /legal/terms different hero textures and accents', () => {
    const privacy = readSource('app/(dynamic)/legal/privacy/layout.tsx');
    const terms = readSource('app/(dynamic)/legal/terms/layout.tsx');

    expect(privacy).toContain('/images/hero/legal-privacy-hero.webp');
    expect(terms).toContain('/images/hero/legal-terms-hero.webp');
    expect(privacy).not.toContain('/images/hero/legal-terms-hero.webp');
    expect(terms).not.toContain('/images/hero/legal-privacy-hero.webp');

    expect(privacy).toContain('marketing-route-hero__accent--purple');
    expect(terms).toContain('marketing-route-hero__accent--pink');
  });

  it('keeps the shared /legal segment layout a pass-through', () => {
    const layout = readSource('app/(dynamic)/legal/layout.tsx');

    expect(layout).not.toContain('<PublicPageShell');
    expect(layout).toContain('export const revalidate = false');
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
