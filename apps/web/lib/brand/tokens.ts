/**
 * Canonical Jovie brand tokens.
 *
 * Single source of truth for the mark path, wordmark kerning, palette, and
 * typography references. Consumed by:
 *   - lib/brand/primitives.tsx (Mark / Wordmark / Lockup React components)
 *   - app/brand/page.tsx (the public brand kit page)
 *   - scripts/generate-brand-assets.ts (PR-2; rasterizes static SVG/PNG assets)
 *
 * The mark path is on a 360×360 viewBox (matches the design source). Existing
 * on-disk SVGs at public/brand/Jovie-Logo-Icon{,-Black,-White}.svg use the
 * legacy 353.68×347.97 viewBox and stay byte-stable. New canonical assets
 * (Jovie-Logo-Mark-{Black,Cream}.svg) ship in PR-2 on the 360×360 viewBox.
 */

export const JOVIE_VIEWBOX = { width: 360, height: 360 } as const;

export const JOVIE_PATH =
  'M179.16,6 L182.24,6.05 C191.16,7.78 199.14,12.50 205.29,19.23 C213.24,27.93 218.16,40.00 218.16,53.37 C218.16,66.74 213.24,78.81 205.29,87.51 C198.59,94.85 189.70,99.79 179.80,101.08 L179.16,101.08 C156.96,101.08 136.86,109.92 122.33,124.21 C107.83,138.48 98.84,158.20 98.84,179.98 C98.84,201.76 107.82,221.48 122.33,235.75 C136.87,250.05 156.97,258.90 179.16,258.90 C201.36,258.90 221.46,250.06 235.99,235.77 C250.50,221.50 259.48,201.78 259.48,180.00 C259.48,162.45 253.67,146.25 243.85,133.18 C233.77,119.75 219.43,109.57 202.80,104.56 L200.69,103.92 C205.05,101.27 209.03,97.96 212.53,94.14 C222.10,83.67 228.03,69.25 228.03,53.37 C228.03,37.49 222.10,23.07 212.53,12.60 C211.09,11.03 209.58,9.54 207.98,8.16 L215.65,9.74 C256.09,18.09 291.46,40.04 316.56,70.49 C341.22,100.40 356.00,138.51 356.00,179.99 C356.00,228.04 336.19,271.54 304.17,303.04 C272.18,334.50 227.98,353.96 179.17,353.96 C130.38,353.96 86.17,334.49 54.17,303.02 C22.15,271.53 2.34,228.03 2.34,179.98 C2.34,131.93 22.15,88.42 54.17,56.93 C86.18,25.47 130.38,6 179.16,6 Z';

/**
 * Per-pair tracking for the geometric JOVIE wordmark, in cap-height units.
 * Hand-tuned per pair, not a global em value.
 *   J→O wants air (the J hook curls outward and the O bulges inward)
 *   V→I tightens (V's right diagonal slopes away from I)
 *   I→E opens slightly (E's vertical stem touching I's vertical reads as one wide bar)
 */
export const WORDMARK_TRACK = {
  JO: 12,
  OV: 12,
  VI: 8,
  IE: 14,
} as const;

/**
 * Canonical color palette. Hex values mirror the design source.
 *
 * Surface ladder: monochrome ladder from ink to cream. Use for backgrounds and
 * elevation hierarchy. Maps onto the existing app's CSS tokens — these constants
 * are for the brand-kit documentation surface only; production UI should keep
 * using --color-bg-base / surface-0 / surface-1 tokens.
 *
 * Feature hues: a carbon-style palette of eight equal accents — no hierarchy,
 * no "brand purple." Use on text, eyebrows, data highlights, never on filled
 * brand surfaces or buttons.
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
    { name: 'Blue', hex: '#4D7DFF' },
    { name: 'Purple', hex: '#9B4DFF' },
    { name: 'Pink', hex: '#EA4A9C' },
    { name: 'Red', hex: '#FF4D5F' },
    { name: 'Orange', hex: '#FFAB2E' },
    { name: 'Green', hex: '#43B85C' },
    { name: 'Teal', hex: '#22B8A7' },
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
    label: 'Body LG · DM Sans 400',
    spec: '22 / 1.4',
    fontVar: '--font-body',
    sample: 'Streams, drops, tips, bookings, and fan capture in a single page.',
    className: 'font-body font-normal leading-[1.4] text-secondary-token',
  },
  body: {
    label: 'Body · DM Sans 400',
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
