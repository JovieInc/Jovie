import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * /compare/[slug] System B source contract.
 *
 * Part of the founder-directed System A -> System B marketing migration
 * (DESIGN.md 2026-06-18). Mirrors the shipped support/download/pricing guards:
 * the route's own source must carry no arbitrary Tailwind values, hex/rgba/
 * gradient colors, raw color scales, inline styles, or the System A editorial
 * type classes (marketing-*-linear / marketing-kicker). Named System B token
 * utilities only. The .linear-marketing bridge (layout-owned) and shared
 * marketing components (MarketingHero / MarketingContainer / FaqSection /
 * ClientFaqAccordion) stay until the final coordinated teardown; this guard
 * only governs the page's own files.
 */

const sources = ['app/(marketing)/compare/[slug]/page.tsx'] as const;

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
  // System A editorial type classes — retired on this surface.
  /\bmarketing-(?:h[1-6]|kicker|lead|body)-?linear\b|\bmarketing-kicker\b/,
] as const;

describe('compare page System B source contract', () => {
  it('keeps /compare/[slug] visuals on named System B primitives', () => {
    for (const sourcePath of sources) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
      for (const pattern of forbiddenRouteVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
