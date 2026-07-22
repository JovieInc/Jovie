import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * /new (Homepage v2) System B source contract.
 *
 * Part of the founder-directed System A -> System B marketing migration
 * (DESIGN.md 2026-06-18). Mirrors the shipped about/support/download guards.
 *
 * The route file and the CTA/pricing components carry the full strict
 * contract: no hex/rgba/gradient colors, no raw color scales, no literal
 * white/black utilities, no arbitrary values, no inline styles, and no
 * System A editorial type classes (marketing-*-linear / marketing-kicker).
 * Hero composition effects live in the colocated HomepageV2Route.css.
 */

const strictSources = [
  'app/(marketing)/new/page.tsx',
  'components/marketing/homepage-v2/HomepageV2Route.tsx',
  'components/marketing/homepage-v2/HomepageV2Ctas.tsx',
] as const;

const heroRouteSource =
  'components/marketing/homepage-v2/HomepageV2Route.tsx' as const;

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
  // System A editorial type classes — retired on this surface.
  /\bmarketing-(?:h[1-6]|kicker|lead|body)-?linear\b|\bmarketing-kicker\b/,
] as const;

describe('homepage v2 (/new) System B source contract', () => {
  it('keeps the route and CTA visuals on named System B primitives', () => {
    for (const sourcePath of strictSources) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
      for (const pattern of forbiddenVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps the System B shell, token type, and CTA anchors in place', () => {
    const source = readFileSync(
      resolve(process.cwd(), heroRouteSource),
      'utf8'
    );

    expect(source).toContain('<MarketingPageShell>');
    expect(source).toContain('MarketingContainer');
    expect(source).toContain('text-primary-token');
    expect(source).toContain('text-secondary-token');
    expect(source).toContain('text-tertiary-token');
    expect(source).toContain('public-action-primary');
    expect(source).toContain('public-action-secondary');
    expect(source).toContain("data-testid='homepage-v2-shell'");
    expect(source).toContain("data-testid='homepage-v2-hero'");
  });
});
