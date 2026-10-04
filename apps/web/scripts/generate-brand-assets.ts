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

import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { wordmarkGeometry } from '../lib/brand/primitives';
import { JOVIE_PATH, JOVIE_VIEWBOX } from '../lib/brand/tokens';
import { DESIGN_TOKENS } from '../lib/design/generated/design-tokens';

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
const STALE_DESKTOP_ICON_CACHE_DIRS = [
  resolve(DESKTOP_ASSETS_DIR, 'icon.iconset'),
  resolve(DESKTOP_ASSETS_DIR, 'icon-staging.iconset'),
] as const;
const MAC_ICONSET_ENTRIES = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
] as const;

const INK = DESIGN_TOKENS.brand.ink;
const CREAM = DESIGN_TOKENS.brand.cream;
const APP_ICON_PADDING = 0.14;
// macOS icon grid: the visible squircle sits inside the canvas, not full
// bleed. Apple's grid reserves ~824/1024 for the tile; a full-bleed tile
// renders oversized in the Dock and app switcher next to grid-conforming
// icons. 0.8 keeps the footprint optically balanced.
const DESKTOP_TILE_RATIO = 0.8;
const DESKTOP_APP_ICON_PADDING = 0.22;
const DESKTOP_APP_ICON_RADIUS = 0.22;
// Small sizes (≤64px, Dock/Spotlight scale) need proportionally larger
// artwork to stay legible — more tile bleed and a bigger mark, per the
// standard macOS icon practice of weighting small sizes heavier.
const DESKTOP_SMALL_TILE_RATIO = 0.85;
const DESKTOP_SMALL_ICON_PADDING = 0.16;
const DESKTOP_SMALL_ICON_MAX = 64;
const MARK_PADDING = 0;

function markSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${JOVIE_VIEWBOX.width} ${JOVIE_VIEWBOX.height}" shape-rendering="geometricPrecision"><path fill="${color}" d="${JOVIE_PATH}"/></svg>`;
}

function wordmarkSvg(color: string): string {
  // Same outlines as <Wordmark> in lib/brand/primitives.tsx (display master).
  const g = wordmarkGeometry(100);
  const glyphs = g.glyphs
    .map(glyph => `<path fill="${color}" d="${glyph.d}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${g.viewBox}">${glyphs}</svg>`;
}

function lockupSvg(color: string): string {
  // The o in the wordmark is the mark (JOV-7760), so the horizontal lockup is
  // the wordmark itself; a separate mark beside it would show the O twice.
  return wordmarkSvg(color);
}

async function writeSvg(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${content}\n`, 'utf8');
  console.log(`wrote ${file}`);
}

type RenderPngOptions = {
  readonly background?: string;
  readonly padding?: number;
  readonly opaque?: boolean;
};

async function renderPngBuffer(
  svg: string,
  size: number,
  options?: RenderPngOptions
): Promise<Buffer> {
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
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

async function renderPng(
  svg: string,
  output: string,
  size: number,
  options?: RenderPngOptions
): Promise<void> {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, await renderPngBuffer(svg, size, options));
  console.log(`wrote ${output} (${size}×${size})`);
}

async function renderAppIcon(output: string, size: number): Promise<void> {
  await renderPng(markSvg(CREAM), output, size, {
    background: INK,
    padding: APP_ICON_PADDING,
    opaque: true,
  });
}

export async function renderDesktopAppIcon(
  output: string,
  size: number
): Promise<void> {
  await mkdir(dirname(output), { recursive: true });
  const small = size <= DESKTOP_SMALL_ICON_MAX;
  const tile = Math.round(
    size * (small ? DESKTOP_SMALL_TILE_RATIO : DESKTOP_TILE_RATIO)
  );
  const radius = Math.round(tile * DESKTOP_APP_ICON_RADIUS);
  // Subtle inner rim separates the near-black tile from dark Dock/menu-bar
  // surfaces without adding a gradient or changing the cream-on-ink identity.
  const rimWidth = Math.max(1, Math.round(tile * 0.006));
  const rimInset = Math.round(rimWidth / 2);
  const rimSize = tile - rimInset * 2;
  const backgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" viewBox="0 0 ${tile} ${tile}"><rect x="${rimInset}" y="${rimInset}" width="${rimSize}" height="${rimSize}" rx="${radius}" fill="${INK}" stroke="${CREAM}" stroke-opacity="0.08" stroke-width="${rimWidth}"/></svg>`;
  const mark = await renderPngBuffer(markSvg(CREAM), tile, {
    padding: small ? DESKTOP_SMALL_ICON_PADDING : DESKTOP_APP_ICON_PADDING,
  });
  const tileOffset = Math.round((size - tile) / 2);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    // Default gravity centres the mark; the tile is already centred on the
    // canvas, so centring both keeps the O optically centred.
    .composite([
      { input: Buffer.from(backgroundSvg), left: tileOffset, top: tileOffset },
      { input: mark },
    ])
    .png({ compressionLevel: 9 })
    .toFile(output);
  console.log(`wrote ${output} (${size}×${size})`);
}

async function renderTransparentMark(
  output: string,
  size: number
): Promise<void> {
  await renderPng(markSvg(CREAM), output, size, {
    padding: MARK_PADDING,
  });
}

async function clearStaleDesktopIconCaches(): Promise<void> {
  await Promise.all(
    STALE_DESKTOP_ICON_CACHE_DIRS.map(async cacheDir => {
      await rm(cacheDir, { recursive: true, force: true });
    })
  );
}

type IconRenderer = (output: string, size: number) => Promise<void>;

async function generateMacIcns(
  output: string,
  iconsetDir: string,
  renderIcon: IconRenderer = renderAppIcon
): Promise<void> {
  // iconutil only exists on macOS; .icns files are gitignored build artifacts
  // produced by `pnpm run prepare:assets` on the signing machine.
  if (process.platform !== 'darwin') {
    console.log(`skipped ${output} (iconutil is macOS-only)`);
    return;
  }
  try {
    for (const [fileName, size] of MAC_ICONSET_ENTRIES) {
      await renderIcon(resolve(iconsetDir, fileName), size);
    }

    const result = spawnSync(
      'iconutil',
      ['-c', 'icns', iconsetDir, '-o', output],
      {
        encoding: 'utf8',
        stdio: 'pipe',
      }
    );

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(
        `iconutil failed for ${output}: ${result.stderr || result.stdout || `exit ${result.status}`}`
      );
    }
  } finally {
    await rm(iconsetDir, { recursive: true, force: true });
  }
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
  await clearStaleDesktopIconCaches();
  await renderDesktopAppIcon(resolve(DESKTOP_ASSETS_DIR, 'icon.png'), 512);
  await renderDesktopAppIcon(
    resolve(DESKTOP_ASSETS_DIR, 'icon-staging.png'),
    512
  );
  await generateMacIcns(
    resolve(DESKTOP_ASSETS_DIR, 'icon.icns'),
    resolve(DESKTOP_ASSETS_DIR, 'icon.iconset'),
    renderDesktopAppIcon
  );
  await generateMacIcns(
    resolve(DESKTOP_ASSETS_DIR, 'icon-staging.icns'),
    resolve(DESKTOP_ASSETS_DIR, 'icon-staging.iconset'),
    renderDesktopAppIcon
  );
}

async function generateContactSheet(): Promise<void> {
  await mkdir(dirname(CONTACT_SHEET_PATH), { recursive: true });
  const samples = [
    { label: 'iOS', file: resolve(IOS_APP_ICON_DIR, 'AppIcon-1024@1x.png') },
    {
      label: 'Electron',
      file: resolve(DESKTOP_ASSETS_DIR, 'icon.png'),
      previewBackground: CREAM,
    },
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

  // 10. Native app icons. iOS keeps the opaque app-icon profile; Electron uses
  //     transparent rounded corners so Dock and app-switcher previews do not
  //     render as a raw square.
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
