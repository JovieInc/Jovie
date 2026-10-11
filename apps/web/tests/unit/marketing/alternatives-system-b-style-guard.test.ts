import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * /alternatives/[slug] System B source contract.
 *
 * Part of the founder-directed System A -> System B marketing migration
 * (DESIGN.md 2026-06-18). Mirrors the shipped support/about guards: the
 * route's own source must carry no arbitrary Tailwind values, hex/rgba/gradient
 * colors, raw color scales, inline styles, --linear-* CTA tokens, or the
 * System A editorial type classes (marketing-*-linear / marketing-kicker).
 * Named System B token utilities only. The .linear-marketing bridge
 * (layout-owned) stays until the final coordinated teardown; this guard only
 * governs the page's own files. The content/alternatives/* data is pure copy,
 * not visual, so it is intentionally out of scope.
 */

const sources = ['app/(marketing)/alternatives/[slug]/page.tsx'] as const;

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

describe('alternatives page System B source contract', () => {
  it('keeps /alternatives/[slug] visuals on named System B primitives', () => {
    for (const sourcePath of sources) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
      for (const pattern of forbiddenRouteVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('does not clamp the hero h1 with a descender-clipping leading', () => {
    // line-clamp-* sets overflow:hidden; a leading of 1.0 or less clips glyph
    // descenders on the second painted line (JOV-6848). If the h1 is clamped,
    // it must carry a named leading token that clears descenders.
    const source = readFileSync(resolve(process.cwd(), sources[0]), 'utf8');
    const h1 = source.match(/<h1[^>]*className='([^']+)'/);
    expect(h1, 'expected an h1 with a literal className').not.toBeNull();
    const className = h1?.[1] ?? '';
    if (/\bline-clamp-\d/.test(className)) {
      expect(className).not.toMatch(/\bleading-none\b/);
      expect(className).toMatch(
        /\bleading-(tight|snug|normal|relaxed|loose)\b/
      );
    }
  });
});
