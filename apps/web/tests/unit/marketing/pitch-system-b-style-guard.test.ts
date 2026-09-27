import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Investor brief System B source contract. Part of the founder-directed
 * System A -> System B marketing migration (DESIGN.md 2026-06-18). The brief
 * (now served only by the gated investor portal) and the gated pitch deck
 * stylesheet were converted off DM Sans (retired 2026-06-18) onto Inter body +
 * Satoshi display. See the /about guard for the shared contract: named
 * System B token utilities only, no arbitrary values / hex / rgba /
 * gradients / raw color scales / inline styles in the route's own source.
 */

const sources = ['components/features/pitch/InvestorBrief.tsx'] as const;

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
  /\bmarketing-(?:h[1-6]|kicker|lead|body)-?linear\b|\bmarketing-kicker\b/,
] as const;

describe('pitch System B source contract', () => {
  it('keeps investor brief visuals on named System B primitives', () => {
    for (const sourcePath of sources) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
      for (const pattern of forbiddenRouteVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps the gated pitch deck stylesheet off DM Sans (retired)', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'assets/investor-deck/colors_and_type.css'),
      'utf8'
    );
    expect(css).not.toMatch(/--font-dm-sans/);
    expect(css).not.toMatch(/DM\+Sans|"DM Sans"/);
    expect(css).toContain('--marketing-font-body: var(--font-inter);');
  });
});
