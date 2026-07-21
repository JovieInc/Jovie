import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * (dynamic)/legal/* System B source contract.
 *
 * Part of the founder-directed System A -> System B marketing migration
 * (DESIGN.md 2026-06-18). Mirrors the shipped about/support/download guards.
 * The legal routes render the shared LegalPage organism inside the
 * PublicPageShell minimal variant; every file in that chain must carry no
 * arbitrary Tailwind values, hex/rgba/gradient colors, raw color scales,
 * literal white/black utilities, named shadow scales, inline styles, or
 * System A editorial type classes. Named System B token utilities only.
 */

const sources = [
  'app/(dynamic)/legal/layout.tsx',
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

describe('legal pages System B source contract', () => {
  it('keeps the legal chain visuals on named System B primitives', () => {
    for (const sourcePath of sources) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
      for (const pattern of forbiddenVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps the PublicPageShell minimal-variant anchors in place', () => {
    const layout = readFileSync(resolve(process.cwd(), sources[0]), 'utf8');

    expect(layout).toContain('<PublicPageShell');
    expect(layout).toContain("headerVariant='minimal'");
    expect(layout).toContain('MarketingContainer');
    expect(layout).toContain('text-primary-token');

    for (const pagePath of sources.slice(1, 5)) {
      const page = readFileSync(resolve(process.cwd(), pagePath), 'utf8');
      expect(page, `${pagePath} must render LegalPage`).toContain('<LegalPage');
    }
  });
});
