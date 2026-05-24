#!/usr/bin/env tsx
/**
 * Brand asset generator (PR-2).
 *
 * Single source: imports JOVIE_PATH from apps/web/lib/brand/tokens.ts.
 * Rasterizes the canonical mark + emits new monochrome SVG variants, PWA
 * icons, favicons, iOS app icons, Electron app icons, and transparent in-app
 * marks. Idempotent — re-running produces the same bytes (modulo PNG
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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');
const PUBLIC = resolve(WEB_ROOT, 'public');
const BRAND_DIR = resolve(PUBLIC, 'brand');
const IOS_ASSETS_DIR = resolve(
  REPO_ROOT,
  'apps/ios/Jovie/Resources/Assets.xcassets'
);
const IOS_APP_ICON_DIR = resolve(IOS_ASSETS_DIR, 'AppIcon.appiconset');
const IOS_LOGO_DIR = resolve(IOS_ASSETS_DIR, 'Jovie-logo.imageset');
const DESKTOP_ASSETS_DIR = resolve(REPO_ROOT, 'apps/desktop/assets');
const CONTACT_SHEET_PATH = resolve(BRAND_DIR, 'jovie-icon-contact-sheet.png');

const INK = '#08090a';
const CREAM = '#F5F4F0';
const APP_ICON_PADDING = 0.14;
const MARK_PADDING = 0;

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
  options?: { background?: string; padding?: number; opaque?: boolean }
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
        channels: options.opaque ? 3 : 4,
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
  if (options?.opaque) {
    pipeline = pipeline
      .flatten({ background: options.background ?? INK })
      .removeAlpha();
  }
  await pipeline.png({ compressionLevel: 9 }).toFile(output);
  console.log(`wrote ${output} (${size}×${size})`);
}

async function renderAppIcon(output: string, size: number): Promise<void> {
  await renderPng(markSvg(CREAM), output, size, {
    background: INK,
    padding: APP_ICON_PADDING,
    opaque: true,
  });
}

async function renderTransparentMark(
  output: string,
  size: number
): Promise<void> {
  await renderPng(markSvg(CREAM), output, size, {
    padding: MARK_PADDING,
  });
}

function parseIconPixelSize(size: string, scale: string): number {
  const logical = Number.parseFloat(size.split('x')[0] ?? '');
  const multiplier = Number.parseInt(scale.replace('x', ''), 10);
  if (!Number.isFinite(logical) || !Number.isFinite(multiplier)) {
    throw new Error(`Invalid app icon declaration ${size} ${scale}`);
  }
  return Math.round(logical * multiplier);
}

async function generateIosIcons(): Promise<void> {
  const contentsPath = resolve(IOS_APP_ICON_DIR, 'Contents.json');
  const contents = JSON.parse(await readFile(contentsPath, 'utf8')) as {
    images: Array<{ filename?: string; size?: string; scale?: string }>;
  };

  for (const image of contents.images) {
    if (!image.filename || !image.size || !image.scale) continue;
    await renderAppIcon(
      resolve(IOS_APP_ICON_DIR, image.filename),
      parseIconPixelSize(image.size, image.scale)
    );
  }

  await renderTransparentMark(resolve(IOS_LOGO_DIR, 'Jovie-logo.png'), 1024);
}

async function generateDesktopIcons(): Promise<void> {
  await renderAppIcon(resolve(DESKTOP_ASSETS_DIR, 'icon.png'), 512);
  await renderAppIcon(resolve(DESKTOP_ASSETS_DIR, 'icon-staging.png'), 512);
}

async function generateContactSheet(): Promise<void> {
  await mkdir(dirname(CONTACT_SHEET_PATH), { recursive: true });
  const samples = [
    { label: 'iOS', file: resolve(IOS_APP_ICON_DIR, 'AppIcon-1024@1x.png') },
    { label: 'Electron', file: resolve(DESKTOP_ASSETS_DIR, 'icon.png') },
    { label: 'Apple Touch', file: resolve(PUBLIC, 'apple-touch-icon.png') },
    { label: 'PWA 192', file: resolve(PUBLIC, 'web-app-manifest-192x192.png') },
    { label: 'PWA 512', file: resolve(PUBLIC, 'web-app-manifest-512x512.png') },
    {
      label: 'Favicon',
      file: resolve(PUBLIC, 'favicon-96x96.png'),
      previewBackground: CREAM,
    },
  ] as const;

  const cellSize = 180;
  const labelHeight = 42;
  const width = samples.length * cellSize;
  const height = cellSize + labelHeight;
  const composites: sharp.OverlayOptions[] = [];

  for (const [index, sample] of samples.entries()) {
    const x = index * cellSize;
    let preview = sharp(sample.file).resize(120, 120, {
      fit: 'contain',
      background: sample.previewBackground ?? {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0,
      },
    });
    if (sample.previewBackground) {
      preview = preview.flatten({ background: sample.previewBackground });
    }

    composites.push({
      input: await preview.png().toBuffer(),
      left: x + 30,
      top: 18,
    });
    composites.push({
      input: Buffer.from(
        `<svg width="${cellSize}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><text x="${cellSize / 2}" y="25" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="600" fill="${CREAM}">${sample.label}</text></svg>`
      ),
      left: x,
      top: cellSize,
    });
  }

  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: INK,
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(CONTACT_SHEET_PATH);
  console.log(`wrote ${CONTACT_SHEET_PATH}`);
}

export async function generateBrandAssets(): Promise<void> {
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
  const inkSvg = markSvg(INK);
  await renderPng(inkSvg, resolve(PUBLIC, 'favicon-16x16.png'), 16);
  await renderPng(inkSvg, resolve(PUBLIC, 'favicon-32x32.png'), 32);
  await renderPng(inkSvg, resolve(PUBLIC, 'favicon-96x96.png'), 96);

  // 6. Web app icons — app-icon profile, opaque ink background.
  await renderAppIcon(
    resolve(BRAND_DIR, 'app-icons/jovie-app-icon-1024.png'),
    1024
  );
  await renderAppIcon(
    resolve(BRAND_DIR, 'app-icons/jovie-app-icon-512.png'),
    512
  );
  await renderAppIcon(
    resolve(BRAND_DIR, 'app-icons/jovie-app-icon-192.png'),
    192
  );

  await renderAppIcon(resolve(PUBLIC, 'apple-touch-icon.png'), 180);

  // 7. Android Chrome icons — maskable safe zone, cream-on-ink
  await renderAppIcon(resolve(PUBLIC, 'android-chrome-192x192.png'), 192);
  await renderAppIcon(resolve(PUBLIC, 'android-chrome-512x512.png'), 512);

  // 8. PWA web app manifest icons
  await renderAppIcon(resolve(PUBLIC, 'web-app-manifest-192x192.png'), 192);
  await renderAppIcon(resolve(PUBLIC, 'web-app-manifest-512x512.png'), 512);

  // 9. Transparent in-app mark. App icons do not consume this file.
  await renderTransparentMark(resolve(PUBLIC, 'Jovie-logo.png'), 1024);

  // 10. Native app icons from the same app-icon profile.
  await generateIosIcons();
  await generateDesktopIcons();
  await generateContactSheet();

  // 11. Convert favicon-32 to favicon.ico (ICO support via sharp toFile with .ico
  //     is not available in our version; emit a single-size PNG-encoded ICO via
  //     png copy. This is a stop-gap; a multi-size ICO requires a dedicated lib.
  //     Modern browsers all use favicon.svg / favicon-32x32.png; ICO is for
  //     legacy IE. Keeping the existing committed favicon.ico is acceptable.

  console.log(
    '\nDone. Generated web, iOS, Electron, and contact-sheet assets.'
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateBrandAssets().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
