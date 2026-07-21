import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * /playlists layout System B source contract. Part of the founder-directed
 * System A -> System B marketing migration (DESIGN.md 2026-06-18). The route
 * layout was reskinned from the legacy `.linear-marketing` System A wrapper
 * onto the semantic `.system-b-marketing` wrapper (same token block, Inter
 * body + Satoshi display). See the /about guard for the shared contract:
 * named System B token utilities only, no arbitrary values / hex / rgba /
 * gradients / raw color scales / inline styles in the layout's own source.
 */

const sources = ['app/(dynamic)/playlists/layout.tsx'] as const;

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

describe('playlists layout System B source contract', () => {
  it('keeps the /playlists layout visuals on named System B primitives', () => {
    for (const sourcePath of sources) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
      for (const pattern of forbiddenRouteVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('renders /playlists on the System B marketing wrapper, not System A', () => {
    for (const sourcePath of sources) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
      expect(source, `${sourcePath} must use .system-b-marketing`).toContain(
        'system-b-marketing dark'
      );
      expect(
        source,
        `${sourcePath} must not use the retired .linear-marketing wrapper`
      ).not.toContain('linear-marketing');
    }
  });
});
