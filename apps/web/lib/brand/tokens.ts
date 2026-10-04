/**
 * Canonical Jovie brand tokens.
 *
 * The mark and wordmark geometry come from one parametric construction
 * (packages/brand/font/construction.py, JOV-7760) through @jovie/ui/brand.
 * This module re-exposes that geometry for server-safe static consumers:
 *   - lib/brand/primitives.tsx (Mark / Wordmark / Lockup)
 *   - components/atoms/BrandLogo.tsx
 *   - app/brand/opengraph-image.tsx and scripts/generate-brand-assets.ts
 * Animated uses (loaders, the collapsing wordmark, Ovie's eyes) render
 * <JovieO> / <JovieWordmark> from @jovie/ui/brand directly.
 */

import { JOVIE_BRAND_GEOMETRY } from '@jovie/ui/brand/geometry.gen';
import {
  type JovieOMaster,
  masterForSize,
} from '@jovie/ui/brand/jovie-o-geometry';

/** The display master: the O on a 100 x 100 box. */
export const JOVIE_VIEWBOX = { width: 100, height: 100 } as const;

/**
 * The mark as one path at a rendered size. 16, 24 and 32 px draw their pixel
 * masters (every tangent edge on a whole pixel); larger sizes draw the
 * display master.
 */
export function jovieMarkAtSize(px: number): {
  readonly viewBox: string;
  readonly d: string;
} {
  const master: JovieOMaster = masterForSize(px);
  const m = JOVIE_BRAND_GEOMETRY.o[master];
  return { viewBox: `0 0 ${m.size} ${m.size}`, d: m.mark };
}

/**
 * Locked mark size ladder (KEEP 2026-09-10 / splash-b-everywhere-v1).
 * Matches the existing Logo.tsx icon scale (xs/sm/md/lg) — no new mark shape.
 * Splash is 32px only: tiny centered cream mark on an empty field.
 * Chrome/header uses 20px. Do not pass ad-hoc pixel sizes.
 */
export const BRAND_MARK_SIZE = {
  compact: 16,
  chrome: 20,
  control: 24,
  splash: 32,
} as const;

export type BrandMarkSizeName = keyof typeof BRAND_MARK_SIZE;
export type BrandMarkSizePx = (typeof BRAND_MARK_SIZE)[BrandMarkSizeName];
export type BrandMarkSize = BrandMarkSizeName | BrandMarkSizePx;

export const BRAND_MARK_CREAM = '#F5F4F0' as const;

/**
 * Ion blue — the canonical brand accent (Noir Ion; PALETTE.feature Ion).
 * Consumed by app-chrome metadata (msapplication-TileColor, Safari mask-icon)
 * so browser chrome renders the locked brand accent instead of retired
 * placeholder hexes.
 */
export const BRAND_ION_BLUE = '#11AFFF' as const;

export function resolveBrandMarkSize(
  size: BrandMarkSize = 'chrome'
): BrandMarkSizePx {
  if (typeof size === 'number') return size;
  return BRAND_MARK_SIZE[size];
}

/**
 * Brand skin variants for the app shell (JOV-4083 / #13493).
 * 'jovie' is the customer product; 'ov' is the internal/admin skin.
 */
export type BrandVariant = 'jovie' | 'ov';

export const JOVIE_PATH: string = JOVIE_BRAND_GEOMETRY.o.display.mark;

/**
 * OV mark path for square slots: the same O. Ovie's full OV pair (the O plus
 * the v, with living eyes) is <JovieO variant='ov'> from @jovie/ui/brand.
 */
export const OV_PATH = JOVIE_PATH;

/** Mark path per brand variant. */
export const BRAND_PATHS: Record<BrandVariant, string> = {
  jovie: JOVIE_PATH,
  ov: OV_PATH,
};

/** Wordmark text per brand variant. */
export const BRAND_WORDMARKS: Record<BrandVariant, string> = {
  jovie: 'Jovie',
  ov: 'OV',
};

/**
 * Canonical color palette. Hex values mirror the design source.
 *
 * Surface ladder: monochrome ladder from ink to cream. Use for backgrounds and
 * elevation hierarchy. Maps onto the existing app's CSS tokens — these constants
 * are for the brand-kit documentation surface only; production UI should keep
 * using --color-bg-base / surface-0 / surface-1 tokens.
 *
 * Feature hues: public documentation for the current Noir Ion semantic anchors.
 * No "brand purple." Use on text, data highlights, and named states, never on
 * filled brand surfaces or buttons.
 */
export const PALETTE = {
  surface: [
    { name: 'Ink', hex: '#08090a', token: '--ink' },
    { name: 'Surface', hex: '#0F1011', token: '--bg-1' },
    { name: 'Card', hex: '#17171A', token: '--bg-2' },
    { name: 'Raised', hex: '#23252A', token: '--bg-3' },
    { name: 'Cream', hex: '#F5F4F0', token: '--cream' },
  ],
  feature: [
    { name: 'Ion', hex: '#11AFFF' },
    { name: 'Ultra', hex: '#8E56F5' },
    { name: 'Pulse', hex: '#F52BB5' },
    { name: 'Mint', hex: '#3FFA8B' },
    { name: 'Orange', hex: '#FF7800' },
    { name: 'Red', hex: '#F72A36' },
    { name: 'Gray', hex: '#8D8D93' },
  ],
} as const;

export type PaletteSwatch = (typeof PALETTE.surface)[number];
export type FeatureSwatch = (typeof PALETTE.feature)[number];

/**
 * Typography canon. Mirrors apps/web/app/globals.css:521-528 and DESIGN.md:33-44.
 * The /brand page documents what already ships; it does NOT introduce new fonts.
 */
export const TYPOGRAPHY = {
  display: {
    label: 'Display · Satoshi 800',
    spec: '120 / 0.95 / -0.025em',
    fontVar: '--font-display',
    sample: 'The link your music deserves.',
    className: 'font-display font-extrabold tracking-[-0.025em] leading-[0.95]',
  },
  h1: {
    label: 'H1 · Satoshi 700',
    spec: '64 / 1.0 / -0.025em',
    fontVar: '--font-display',
    sample: 'Stay in the studio.',
    className: 'font-display font-bold tracking-[-0.025em] leading-[1.0]',
  },
  h2: {
    label: 'H2 · Satoshi 700',
    spec: '32 / 1.1 / -0.02em',
    fontVar: '--font-display',
    sample: 'Know who your fans are and when to reach them.',
    className: 'font-display font-bold tracking-[-0.02em] leading-[1.1]',
  },
  bodyLg: {
    label: 'Body LG · Inter 400',
    spec: '22 / 1.4',
    fontVar: '--font-body',
    sample: 'Streams, drops, tips, bookings, and fan capture in a single page.',
    className: 'font-body font-normal leading-[1.4] text-secondary-token',
  },
  body: {
    label: 'Body · Inter 400',
    spec: '15 / 1.55',
    fontVar: '--font-body',
    sample: 'Turn attention into action.',
    className: 'font-body font-normal leading-[1.55] text-secondary-token',
  },
  ui: {
    label: 'Product UI · Inter 450',
    spec: '13 / 1.4',
    fontVar: '--font-sans',
    sample: 'Search tasks · Live · Scheduled · Announced',
    className: 'font-sans leading-[1.4]',
  },
} as const;
