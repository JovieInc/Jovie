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
  LETTER_PAIRS,
  LETTER_PATHS,
  LETTER_SEQUENCE,
} from '../lib/brand/wordmark-letters';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, '..');
const PUBLIC = resolve(WEB_ROOT, 'public');
const BRAND_DIR = resolve(PUBLIC, 'brand');

const INK = '#08090a';
const CREAM = '#F5F4F0';

function markSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${JOVIE_VIEWBOX.width} ${JOVIE_VIEWBOX.height}" shape-rendering="geometricPrecision"><path fill="${color}" d="${JOVIE_PATH}"/></svg>`;
}

function wordmarkSvg(color: string): string {
  // Same layout math as <Wordmark> in lib/brand/primitives.tsx — kept in lock
  // step so the static SVG matches the React render byte-for-byte.
  type Placed = {
    letter: (typeof LETTER_SEQUENCE)[number];
    x: number;
    w: number;
    d: string;
    rule?: 'evenodd';
  };
  const placed: Placed[] = LETTER_SEQUENCE.reduce<Placed[]>(
    (acc, letter, i) => {
      const prev = acc[i - 1];
      const prevPair = i > 0 ? LETTER_PAIRS[i - 1] : undefined;
      const prevAdvance = prev
        ? prev.w + (prevPair ? WORDMARK_TRACK[prevPair] : 0)
        : 0;
      const x = (prev?.x ?? 0) + prevAdvance;
      const p = LETTER_PATHS[letter];
      acc.push({ letter, x, w: p.w, d: p.d, rule: p.rule });
      return acc;
    },
    []
  );
  const last = placed[placed.length - 1];
  const lastPair = LETTER_PAIRS[placed.length - 1];
  const totalW = last.x + last.w + (lastPair ? WORDMARK_TRACK[lastPair] : 0);
  const glyphs = placed
    .map(
      p =>
        `<path fill="${color}" fill-rule="${p.rule ?? 'nonzero'}" transform="translate(${p.x} 0)" d="${p.d}"/>`
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} 100">${glyphs}</svg>`;
}

function lockupSvg(color: string): string {
  // Horizontal lockup: mark at left, wordmark to the right with a gap of
  // 0.34 × mark height. Mark sized 100, wordmark height 74 → gap 34.
  // Mark sits on a 360×360 viewBox; scale to 100 → factor 100/360 = 0.2778.
  // Wordmark total width is 374u, scaled to height 74 → width 74 * 374/100 = 276.76.
  const markH = 100;
  const wordmarkH = 74;
  const gap = 34;
  const wordmarkW = (wordmarkH * 374) / 100;
  const totalW = markH + gap + wordmarkW;
  const totalH = markH;
  const yOffsetWordmark = (markH - wordmarkH) / 2;
  // Inline both via group transforms to avoid <use> + defs complexity.
  const markGroup = `<g transform="scale(${markH / 360})"><path fill="${color}" d="${JOVIE_PATH}"/></g>`;
  // Inline wordmark glyphs at the wordmark's intrinsic 374×100 viewBox, then
  // scale into the lockup coordinate space.
  type Placed = {
    x: number;
    w: number;
    d: string;
    rule?: 'evenodd';
  };
  const placed: Placed[] = LETTER_SEQUENCE.reduce<Placed[]>(
    (acc, letter, i) => {
      const prev = acc[i - 1];
      const prevPair = i > 0 ? LETTER_PAIRS[i - 1] : undefined;
      const prevAdvance = prev
        ? prev.w + (prevPair ? WORDMARK_TRACK[prevPair] : 0)
        : 0;
      const x = (prev?.x ?? 0) + prevAdvance;
      const p = LETTER_PATHS[letter];
      acc.push({ x, w: p.w, d: p.d, rule: p.rule });
      return acc;
    },
    []
  );
  const wordmarkInner = placed
    .map(
      p =>
        `<path fill="${color}" fill-rule="${p.rule ?? 'nonzero'}" transform="translate(${p.x} 0)" d="${p.d}"/>`
    )
    .join('');
  const wordmarkScale = wordmarkH / 100;
  const wordmarkGroup = `<g transform="translate(${markH + gap} ${yOffsetWordmark}) scale(${wordmarkScale})">${wordmarkInner}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}">${markGroup}${wordmarkGroup}</svg>`;
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
  const dualModeFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${JOVIE_VIEWBOX.width} ${JOVIE_VIEWBOX.height}" shape-rendering="geometricPrecision"><style>path{fill:${INK}}@media (prefers-color-scheme:dark){path{fill:${CREAM}}}</style><path d="${JOVIE_PATH}"/></svg>`;
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
