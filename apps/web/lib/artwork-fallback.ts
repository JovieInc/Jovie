import type { CSSProperties } from 'react';

type ArtworkFallbackStyle = CSSProperties &
  Record<`--artwork-fallback-${string}`, string>;

function hashArtworkSeed(seed: string): number {
  let hash = 0;
  for (const char of seed.trim() || 'release') {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }
  return hash;
}

const FALLBACK_PALETTES = [
  {
    base: 'oklch(0.25 0.04 286)',
    depth: 'oklch(0.12 0.024 286)',
    panel: 'oklch(0.34 0.05 286)',
    rule: 'rgba(255,255,255,0.09)',
    accent: 'oklch(0.77 0.11 322 / 0.5)',
  },
  {
    base: 'oklch(0.24 0.038 302)',
    depth: 'oklch(0.11 0.022 302)',
    panel: 'oklch(0.33 0.052 302)',
    rule: 'rgba(255,255,255,0.082)',
    accent: 'oklch(0.74 0.12 342 / 0.46)',
  },
  {
    base: 'oklch(0.23 0.036 272)',
    depth: 'oklch(0.105 0.022 272)',
    panel: 'oklch(0.32 0.046 272)',
    rule: 'rgba(255,255,255,0.078)',
    accent: 'oklch(0.72 0.1 255 / 0.44)',
  },
] as const;

function getArtworkPalette(seed: string) {
  const hash = hashArtworkSeed(seed);
  return {
    hash,
    palette: FALLBACK_PALETTES[hash % FALLBACK_PALETTES.length]!,
  };
}

export function getArtworkFallbackSurfaceStyle(
  seed: string
): ArtworkFallbackStyle {
  const { hash, palette } = getArtworkPalette(seed);
  const angle = 128 + (hash % 14);

  return {
    '--artwork-fallback-angle': `${angle}deg`,
    '--artwork-fallback-base': palette.base,
    '--artwork-fallback-depth': palette.depth,
    '--artwork-fallback-panel': palette.panel,
    '--artwork-fallback-rule': palette.rule,
    '--artwork-fallback-accent': palette.accent,
    background: [
      `linear-gradient(var(--artwork-fallback-angle), color-mix(in oklab, var(--artwork-fallback-panel) 88%, white 12%), var(--artwork-fallback-depth) 58%, var(--artwork-fallback-base))`,
      `linear-gradient(${angle + 92}deg, transparent 0 39%, var(--artwork-fallback-rule) 39% 40%, transparent 40% 100%)`,
      'linear-gradient(180deg, rgba(255,255,255,0.08), transparent 34%, rgba(0,0,0,0.16) 100%)',
      'repeating-linear-gradient(90deg, rgba(255,255,255,0.034) 0 1px, transparent 1px 10px)',
    ].join(', '),
  };
}

export function getArtworkFallbackAccentStyle(
  seed: string
): ArtworkFallbackStyle {
  const { palette } = getArtworkPalette(seed);

  return {
    '--artwork-fallback-accent': palette.accent,
    background:
      'linear-gradient(90deg, transparent, var(--artwork-fallback-accent), transparent)',
  };
}
