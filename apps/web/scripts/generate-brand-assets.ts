#!/usr/bin/env tsx
/**
 * Brand asset generator (PR-2).
 *
 * Single source: imports JOVIE_PATH from apps/web/lib/brand/tokens.ts.
 * Rasterizes the canonical mark + emits new monochrome SVG variants, PWA
 * icons, favicons, and the apex Jovie-logo.png that the desktop icon script
 * consumes. Idempotent — re-running produces the same bytes (modulo PNG
 * encoding determinism in sharp).
 *
 * Run from the repo root:
 *   pnpm --filter @jovie/web exec tsx apps/web/scripts/generate-brand-assets.ts
 *
 * Then refresh the desktop icon:
 *   pnpm --filter desktop run prepare:assets
 *
 * Notes on byte stability:
 *   - apps/web/public/brand/Jovie-Logo-Icon{,-Black,-White}.svg are NOT
 *     overwritten. Existing consumers (JSON-LD schema, admin HUD, audit
 *     allowlists) depend on those byte-stable. The new canon ships under
 *     Jovie-Logo-Mark-{Black,Cream}.svg.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { JOVIE_PATH, JOVIE_VIEWBOX, WORDMARK_TRACK } from '../lib/brand/tokens';
import {
  computeWordmarkLayout,
  type PlacedLetter,
} from '../lib/brand/wordmark-letters';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, '..');
const PUBLIC = resolve(WEB_ROOT, 'public');
const BRAND_DIR = resolve(PUBLIC, 'brand');

const INK = '#08090a';
const CREAM = '#F5F4F0';

const VIEWBOX = `0 0 ${JOVIE_VIEWBOX.width} ${JOVIE_VIEWBOX.height}`;
const LAYOUT = computeWordmarkLayout(WORDMARK_TRACK);
const WORDMARK_WIDTH_U = LAYOUT.totalWidth;
// Lockup ratios — mark height 100u, wordmark height 74u, gap 34u (0.34× mark).
// All proportions derive from the canonical mark + wordmark; no hand-tuned
// magic numbers that could drift from the React Lockup component.
const LOCKUP_MARK_H = 100;
const LOCKUP_WORDMARK_H = 74;
const LOCKUP_GAP = 34;
const LOCKUP_MARK_SCALE = LOCKUP_MARK_H / JOVIE_VIEWBOX.width;
const LOCKUP_WORDMARK_SCALE = LOCKUP_WORDMARK_H / 100;
const LOCKUP_WORDMARK_OFFSET_Y = (LOCKUP_MARK_H - LOCKUP_WORDMARK_H) / 2;
const LOCKUP_TOTAL_W =
  LOCKUP_MARK_H + LOCKUP_GAP + WORDMARK_WIDTH_U * LOCKUP_WORDMARK_SCALE;

function markSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" shape-rendering="geometricPrecision"><path fill="${color}" d="${JOVIE_PATH}"/></svg>`;
}

function glyphsForLayout(
  placed: readonly PlacedLetter[],
  color: string
): string {
  return placed
    .map(
      p =>
        `<path fill="${color}" fill-rule="${p.rule ?? 'nonzero'}" transform="translate(${p.x} 0)" d="${p.d}"/>`
    )
    .join('');
}

function wordmarkSvg(color: string): string {
  const glyphs = glyphsForLayout(LAYOUT.placed, color);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORDMARK_WIDTH_U} 100">${glyphs}</svg>`;
}

function lockupSvg(color: string): string {
  const markGroup = `<g transform="scale(${LOCKUP_MARK_SCALE})"><path fill="${color}" d="${JOVIE_PATH}"/></g>`;
  const wordmarkGroup = `<g transform="translate(${LOCKUP_MARK_H + LOCKUP_GAP} ${LOCKUP_WORDMARK_OFFSET_Y}) scale(${LOCKUP_WORDMARK_SCALE})">${glyphsForLayout(LAYOUT.placed, color)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOCKUP_TOTAL_W} ${LOCKUP_MARK_H}">${markGroup}${wordmarkGroup}</svg>`;
}

async function writeSvg(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${content}\n`, 'utf8');
  console.log(`wrote ${file}`);
}

async function renderPng(
  svg: string,
  output: string,
  size: number,
  options?: { background?: string; padding?: number }
): Promise<void> {
  await mkdir(dirname(output), { recursive: true });
  const innerSize = options?.padding
    ? Math.round(size * (1 - options.padding * 2))
    : size;
  const offset = Math.round((size - innerSize) / 2);
  let pipeline = sharp(Buffer.from(svg), { density: 384 }).resize(
    innerSize,
    innerSize,
    {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    }
  );
  if (options?.background) {
    const background = options.background;
    pipeline = sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: background,
      },
    }).composite([
      {
        input: await pipeline.png().toBuffer(),
        left: offset,
        top: offset,
      },
    ]);
  }
  await pipeline.png({ compressionLevel: 9 }).toFile(output);
  console.log(`wrote ${output} (${size}×${size})`);
}

async function main(): Promise<void> {
  console.log('Generating Jovie brand assets...\n');

  // 1. New canonical monochrome SVG marks (360×360, byte-fresh)
  await writeSvg(resolve(BRAND_DIR, 'Jovie-Logo-Mark-Black.svg'), markSvg(INK));
  await writeSvg(
    resolve(BRAND_DIR, 'Jovie-Logo-Mark-Cream.svg'),
    markSvg(CREAM)
  );

  // 2. New geometric JOVIE wordmark SVGs
  await writeSvg(
    resolve(BRAND_DIR, 'Jovie-Wordmark-Black.svg'),
    wordmarkSvg(INK)
  );
  await writeSvg(
    resolve(BRAND_DIR, 'Jovie-Wordmark-Cream.svg'),
    wordmarkSvg(CREAM)
  );

  // 3. New horizontal lockup SVGs (mark + wordmark)
  await writeSvg(resolve(BRAND_DIR, 'Jovie-Lockup-Black.svg'), lockupSvg(INK));
  await writeSvg(
    resolve(BRAND_DIR, 'Jovie-Lockup-Cream.svg'),
    lockupSvg(CREAM)
  );

  // 4. Favicon.svg — dual-mode via @media prefers-color-scheme
  const dualModeFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" shape-rendering="geometricPrecision"><style>path{fill:${INK}}@media (prefers-color-scheme:dark){path{fill:${CREAM}}}</style><path d="${JOVIE_PATH}"/></svg>`;
  await writeSvg(resolve(PUBLIC, 'favicon.svg'), dualModeFavicon);

  // 5. Favicons — cream mark on transparent (browser tabs auto-tint as needed,
  //    but we provide pre-tinted variants for older clients).
  const creamSvg = markSvg(CREAM);
  const inkSvg = markSvg(INK);
  await renderPng(inkSvg, resolve(PUBLIC, 'favicon-16x16.png'), 16);
  await renderPng(inkSvg, resolve(PUBLIC, 'favicon-32x32.png'), 32);
  await renderPng(inkSvg, resolve(PUBLIC, 'favicon-96x96.png'), 96);

  // 6. Apple touch icon — cream mark on ink, with safe-area padding
  await renderPng(creamSvg, resolve(PUBLIC, 'apple-touch-icon.png'), 180, {
    background: INK,
    padding: 0.16,
  });

  // 7. Android Chrome icons — maskable safe zone, cream-on-ink
  await renderPng(
    creamSvg,
    resolve(PUBLIC, 'android-chrome-192x192.png'),
    192,
    { background: INK, padding: 0.18 }
  );
  await renderPng(
    creamSvg,
    resolve(PUBLIC, 'android-chrome-512x512.png'),
    512,
    { background: INK, padding: 0.18 }
  );

  // 8. PWA web app manifest icons
  await renderPng(
    creamSvg,
    resolve(PUBLIC, 'web-app-manifest-192x192.png'),
    192,
    { background: INK, padding: 0.16 }
  );
  await renderPng(
    creamSvg,
    resolve(PUBLIC, 'web-app-manifest-512x512.png'),
    512,
    { background: INK, padding: 0.16 }
  );

  // 9. Jovie-logo.png — the desktop icon source (apex of the chain).
  //    apps/desktop/scripts/prepare-icons.mjs reads this and emits icon.png.
  await renderPng(creamSvg, resolve(PUBLIC, 'Jovie-logo.png'), 1024, {
    background: INK,
    padding: 0.14,
  });

  // 10. Convert favicon-32 to favicon.ico (ICO support via sharp toFile with .ico
  //     is not available in our version; emit a single-size PNG-encoded ICO via
  //     png copy. This is a stop-gap; a multi-size ICO requires a dedicated lib.
  //     Modern browsers all use favicon.svg / favicon-32x32.png; ICO is for
  //     legacy IE. Keeping the existing committed favicon.ico is acceptable.

  console.log('\nDone. Next: pnpm --filter desktop run prepare:assets');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
