/**
 * Renders product shots declared in `lib/screenshots/product-shots.ts`.
 *
 *   pnpm --filter @jovie/web shots:render [--base-url URL] [--only id[,id]] [--stale]
 *
 * Needs a running server with the demo routes (`dev:local:playwright`, or the
 * screenshot workflow's production build). For each shot it opens the demo
 * route at the scenario viewport and 2x DPR in dark mode with reduced motion,
 * crops to the declared element plus padding, then encodes AVIF and WebP at
 * `displayWidth * 2` into `public/product-shots/` and records the source hash
 * in `product-shots.manifest.json`. `--stale` renders only shots whose source
 * or spec hash no longer matches the manifest.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
  PRODUCT_SHOT_DPR,
  PRODUCT_SHOTS,
  type ProductShotSpec,
} from '../../lib/screenshots/product-shots';
import { SCREENSHOT_VIEWPORTS } from '../../lib/screenshots/registry';
import {
  checkShotGeometry,
  expandVariants,
  oversizedFormats,
  type PageBox,
  parseRenderArgs,
  type ShotManifestEntry,
  selectShots,
  unionClip,
} from './plan';
import { hashShotSources, hashShotSpec } from './source-hash.mjs';

const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const REPO_ROOT = path.resolve(WEB_ROOT, '../..');
const OUT_DIR = path.join(WEB_ROOT, 'public/product-shots');
const MANIFEST_PATH = path.join(
  WEB_ROOT,
  'lib/screenshots/product-shots.manifest.json'
);
type ManifestEntry = ShotManifestEntry;

interface Manifest {
  schema: 'jovie.product-shots/v1';
  shots: Record<string, ManifestEntry>;
}

function readManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
}

async function cropBox(page: Page, spec: ProductShotSpec) {
  const boxes: PageBox[] = [];
  for (const selector of spec.crop) {
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible', timeout: 30_000 });
    const box = await target.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left + scrollX,
        top: rect.top + scrollY,
        right: rect.right + scrollX,
        bottom: rect.bottom + scrollY,
      };
    });
    if (box.right - box.left < 1 || box.bottom - box.top < 1) {
      throw new Error(`${spec.id}: crop target ${selector} has no box`);
    }
    boxes.push(box);
  }
  const pageSize = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  return unionClip(boxes, pageSize, spec.padding ?? 0, spec.maxHeight);
}

function captureViewport(spec: ProductShotSpec) {
  const base = SCREENSHOT_VIEWPORTS[spec.viewport];
  return { ...base, height: spec.viewportHeight ?? base.height };
}

type Clip = ReturnType<typeof unionClip>;

/**
 * Smallest visible text font-size (computed CSS px) inside the crop. Skips
 * aria-hidden and decorative subtrees, hidden elements, and text outside the
 * clip. Null when the crop shows no text.
 */
async function measureMinTextPx(
  page: Page,
  clip: Clip
): Promise<number | null> {
  return page.evaluate(area => {
    let min: number | null = null;
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue?.trim()) continue;
      const element = node.parentElement;
      if (
        !element ||
        element.closest(
          '[aria-hidden="true"],[role="presentation"],script,style,nextjs-portal,[data-sonner-toaster]'
        )
      )
        continue;
      const style = getComputedStyle(element);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      )
        continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const left = rect.left + scrollX;
      const top = rect.top + scrollY;
      const inside =
        left < area.x + area.width &&
        left + rect.width > area.x &&
        top < area.y + area.height &&
        top + rect.height > area.y;
      if (!inside) continue;
      const size = Number.parseFloat(style.fontSize);
      if (Number.isFinite(size) && (min === null || size < min)) min = size;
    }
    return min;
  }, clip);
}

async function renderShot(page: Page, baseUrl: string, spec: ProductShotSpec) {
  if (spec.fixedNow) await page.clock.setFixedTime(new Date(spec.fixedNow));
  await page.goto(new URL(spec.route, baseUrl).toString(), {
    // Not networkidle: demo profiles keep posting analytics beacons, so the
    // network never goes quiet. The spec's waitFor selector plus fonts and
    // decoded images are the readiness signal.
    waitUntil: 'load',
    timeout: 120_000,
  });
  await page.locator(spec.waitFor).first().waitFor({ timeout: 60_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map(image =>
        image.complete ? undefined : image.decode().catch(() => undefined)
      )
    );
  });
  // Next dev overlays and toasts are not product UI.
  await page.addStyleTag({
    content:
      'nextjs-portal,[data-nextjs-toast],[data-sonner-toaster]{display:none!important}',
  });
  // Focus rings are interaction state, not the product moment. Focus traps
  // (dialogs, drawers) re-focus after a blur, so suppress the styling of the
  // focused element instead of moving focus.
  await page.addStyleTag({
    content:
      ':focus,:focus-visible{outline:none!important;box-shadow:none!important;--tw-ring-shadow:0 0 #0000!important;--tw-ring-offset-shadow:0 0 #0000!important}',
  });
  const clip = await cropBox(page, spec);
  const minTextPx = await measureMinTextPx(page, clip);
  const viewport = captureViewport(spec);
  const png = await page.screenshot({
    clip,
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
  });

  const targetWidth = spec.displayWidth * PRODUCT_SHOT_DPR;
  const resized = sharp(png).resize({
    width: targetWidth,
    withoutEnlargement: true,
  });
  mkdirSync(OUT_DIR, { recursive: true });
  const avifPath = path.join(OUT_DIR, `${spec.id}.avif`);
  const webpPath = path.join(OUT_DIR, `${spec.id}.webp`);
  const info = await resized
    .clone()
    .avif({ quality: 58, effort: 7, chromaSubsampling: '4:4:4' })
    .toFile(avifPath);
  await resized.clone().webp({ quality: 82, effort: 6 }).toFile(webpPath);

  const bytes = {
    avif: statSync(avifPath).size,
    webp: statSync(webpPath).size,
  };
  const oversized = oversizedFormats(spec.id, bytes);
  if (oversized.length > 0) throw new Error(oversized.join('; '));
  const entry = {
    width: info.width,
    height: info.height,
    sourceHash: hashShotSources(REPO_ROOT, spec.sources),
    specHash: hashShotSpec(spec),
    renderedAt: new Date().toISOString(),
    sources: [...spec.sources],
    bytes,
    frame: spec.frame,
    fullScreen: spec.fullScreen ?? false,
    displayWidth: spec.displayWidth,
    capture: {
      cssWidth: clip.width,
      cssHeight: clip.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    },
    minTextPx,
  } satisfies ManifestEntry;
  const violations = checkShotGeometry(spec.id, entry);
  if (violations.length > 0) throw new Error(violations.join('; '));
  return entry;
}

async function main() {
  const args = parseRenderArgs(process.argv.slice(2), process.env);
  const manifest = readManifest();
  const shots = selectShots(
    REPO_ROOT,
    PRODUCT_SHOTS as readonly ProductShotSpec[],
    manifest.shots,
    args
  );
  if (shots.length === 0) {
    process.stdout.write('[shots] nothing to render\n');
    return;
  }

  const browser = await chromium.launch();
  const failures: string[] = [];
  try {
    for (const spec of shots.flatMap(expandVariants)) {
      const context = await browser.newContext({
        viewport: captureViewport(spec),
        deviceScaleFactor: PRODUCT_SHOT_DPR,
        colorScheme: spec.theme === 'dark' ? 'dark' : 'light',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const started = Date.now();
      try {
        manifest.shots[spec.id] = await renderShot(page, args.baseUrl, spec);
        const entry = manifest.shots[spec.id];
        process.stdout.write(
          `[shots] ${spec.id} ${entry.width}x${entry.height} avif=${entry.bytes.avif} webp=${entry.bytes.webp} ${Date.now() - started}ms\n`
        );
      } catch (error) {
        failures.push(`${spec.id}: ${(error as Error).message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const sorted = Object.fromEntries(
    Object.entries(manifest.shots).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(
    MANIFEST_PATH,
    `${JSON.stringify({ ...manifest, shots: sorted }, null, 2)}\n`
  );
  if (failures.length > 0) {
    process.stderr.write(`[shots] failed:\n${failures.join('\n')}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  void main().catch((error: unknown) => {
    process.stderr.write(`[shots] ${String(error)}\n`);
    process.exitCode = 1;
  });
}
