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
    base: 'oklch(0.19 0.012 282)',
    depth: 'oklch(0.1 0.008 282)',
    panel: 'oklch(0.25 0.014 282)',
    rule: 'rgba(255,255,255,0.065)',
    accent: 'oklch(0.78 0.012 282 / 0.32)',
  },
  {
    base: 'oklch(0.18 0.01 292)',
    depth: 'oklch(0.095 0.007 292)',
    panel: 'oklch(0.24 0.012 292)',
    rule: 'rgba(255,255,255,0.058)',
    accent: 'oklch(0.75 0.014 292 / 0.3)',
  },
  {
    base: 'oklch(0.17 0.009 266)',
    depth: 'oklch(0.09 0.006 266)',
    panel: 'oklch(0.23 0.011 266)',
    rule: 'rgba(255,255,255,0.052)',
    accent: 'oklch(0.72 0.012 266 / 0.28)',
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
      `linear-gradient(var(--artwork-fallback-angle), var(--artwork-fallback-panel), var(--artwork-fallback-depth) 62%, var(--artwork-fallback-base))`,
      `linear-gradient(${angle + 86}deg, transparent 0 46%, var(--artwork-fallback-rule) 46% 47%, transparent 47% 100%)`,
      'repeating-linear-gradient(90deg, rgba(255,255,255,0.026) 0 1px, transparent 1px 8px)',
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
