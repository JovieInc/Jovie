import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * /demovideo System B source contract.
 *
 * Part of the founder-directed System A -> System B marketing migration
 * (DESIGN.md 2026-06-18). Mirrors the shipped about/support/download guards.
 *
 * The route file and DemoVideoPage carry the full strict contract: no
 * hex/rgba/gradient colors, no raw color scales, no literal white/black
 * utilities, no arbitrary values, no named shadow scales, no inline styles,
 * and no System A editorial type classes.
 *
 * DemoVideoPlayer is a shared media control with an established carve-out:
 * its floating play button intentionally keeps white/black overlay utilities
 * over video content. It is still pinned against literal color formats,
 * gradients, arbitrary values, raw palette scales, and System A classes so
 * the debt cannot spread.
 */

const strictSources = [
  'app/(marketing)/demovideo/page.tsx',
  'components/features/demo/DemoVideoPage.tsx',
] as const;

const playerSource = 'components/features/demo/DemoVideoPlayer.tsx' as const;

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

const forbiddenPlayerPatterns = [
  /style=\{/,
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /--linear-/,
  /\b(?:bg|border|text|ring|shadow|decoration|rounded|h|w|max-w|min-h|tracking|leading|px|py|pt|pb|z)-\[/,
  /\b(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|blue|green|purple|pink|yellow|teal|lime|slate|gray|zinc|neutral|stone)-(?:[0-9]|\[|\/)/,
  /\bmarketing-(?:h[1-6]|kicker|lead|body)-?linear\b|\bmarketing-kicker\b/,
] as const;

describe('demovideo page System B source contract', () => {
  it('keeps /demovideo visuals on named System B primitives', () => {
    for (const sourcePath of strictSources) {
      const source = readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
      for (const pattern of forbiddenVisualPatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps the shared video player within its media-control carve-out', () => {
    const source = readFileSync(resolve(process.cwd(), playerSource), 'utf8');
    for (const pattern of forbiddenPlayerPatterns) {
      expect(source, `${playerSource} matched ${pattern}`).not.toMatch(pattern);
    }
  });

  it('keeps the System B token anchors in place', () => {
    const source = readFileSync(
      resolve(process.cwd(), strictSources[1]),
      'utf8'
    );

    expect(source).toContain('text-primary-token');
    expect(source).toContain('border-subtle');
    expect(source).toContain('<DemoVideoPlayer');
  });
});
