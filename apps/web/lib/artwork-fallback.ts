import type { CSSProperties } from 'react';

function hashArtworkSeed(seed: string): number {
  let hash = 0;
  for (const char of seed.trim() || 'release') {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }
  return hash;
}

const FALLBACK_PALETTES = [
  {
    base: 'oklch(0.19 0.032 278)',
    depth: 'oklch(0.1 0.018 286)',
    glow: 'oklch(0.58 0.105 310)',
    accent: 'oklch(0.52 0.095 252)',
  },
  {
    base: 'oklch(0.18 0.03 292)',
    depth: 'oklch(0.095 0.018 302)',
    glow: 'oklch(0.6 0.11 328)',
    accent: 'oklch(0.5 0.09 270)',
  },
  {
    base: 'oklch(0.18 0.028 258)',
    depth: 'oklch(0.095 0.016 270)',
    glow: 'oklch(0.57 0.105 248)',
    accent: 'oklch(0.58 0.105 306)',
  },
] as const;

function getArtworkPalette(seed: string) {
  const hash = hashArtworkSeed(seed);
  return {
    hash,
    palette: FALLBACK_PALETTES[hash % FALLBACK_PALETTES.length]!,
  };
}

export function getArtworkFallbackSurfaceStyle(seed: string): CSSProperties {
  const { hash, palette } = getArtworkPalette(seed);
  const angle = 126 + (hash % 18);

  return {
    background: [
      `linear-gradient(${angle}deg, color-mix(in oklab, ${palette.base} 82%, ${palette.glow} 18%), ${palette.depth} 64%, color-mix(in oklab, ${palette.depth} 78%, ${palette.accent} 22%))`,
      `linear-gradient(${angle + 82}deg, transparent 0 48%, color-mix(in oklab, ${palette.glow} 20%, transparent) 48% 49%, transparent 49% 100%)`,
      'repeating-linear-gradient(90deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 7px)',
    ].join(', '),
  };
}

export function getArtworkFallbackAccentStyle(seed: string): CSSProperties {
  const { palette } = getArtworkPalette(seed);

  return {
    background: `linear-gradient(90deg, ${palette.glow}, ${palette.accent})`,
  };
}
