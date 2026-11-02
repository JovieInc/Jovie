/**
 * Trustworthy Pen renders through Chromium (root fix for the 2026-11-01
 * export bugs: Material Symbols drawn as "?", frames over ~400px garbled).
 *
 * Pen's raster export races web-font loading and, for large frames, can read
 * back a mis-strided GPU buffer (rows of speckle). This path never uses Pen's
 * rasteriser: the frame is exported as `html-css` (icons arrive as inline SVG,
 * so no icon font is involved), then rendered in headless Chromium with
 *
 *   - fonts bundled locally: Google Fonts links are replaced by @font-face
 *     rules pointing at the repo's own woff2 files (apps/web/public/fonts), so
 *     a render never depends on the network for Inter or Satoshi;
 *   - image fills resolved against the .pen workspace folder (Pen writes them
 *     as paths relative to the .pen file);
 *   - an explicit wait: document.fonts.ready, every <img> decoded, every CSS
 *     background image preloaded, then two animation frames;
 *   - a font audit: every family the frame uses must report
 *     document.fonts.check() true, else the render fails (never a silent
 *     fallback font).
 *
 * Playwright is resolved from PEN_REVIEW_PLAYWRIGHT (a module dir), else from
 * apps/web (Gem worktrees). Chromium is the cached Playwright build unless
 * PEN_REVIEW_CHROMIUM points at a binary.
 */

/// <reference lib="dom" />

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FONT_DIR = join(REPO, 'apps/web/public/fonts');

/**
 * Families served from the repo instead of Google Fonts.
 * @type {Readonly<Record<string, {file: string, weight: string}>>}
 */
export const LOCAL_FONTS = Object.freeze({
  Inter: { file: 'Inter-Variable.woff2', weight: '100 900' },
  Satoshi: { file: 'Satoshi-Variable.woff2', weight: '300 900' },
});

function loadPlaywright() {
  const candidates = [
    process.env.PEN_REVIEW_PLAYWRIGHT,
    join(REPO, 'apps/web/package.json'),
    join(REPO, 'package.json'),
  ].filter(Boolean);
  for (const c of candidates) {
    const req = createRequire(
      c.endsWith('.json') ? c : join(c, 'package.json')
    );
    for (const name of ['playwright-core', 'playwright', '@playwright/test']) {
      try {
        return req(name);
      } catch {
        // try the next candidate
      }
    }
  }
  throw new Error(
    'playwright not found: set PEN_REVIEW_PLAYWRIGHT to a dir with playwright-core installed'
  );
}

/**
 * Rewrites a Pen html-css export so it renders offline and deterministically.
 * Pure: (html, {assetBase, fontDir}) -> html.
 * @param {string} html
 * @param {{assetBase?: string, fontDir?: string, localFonts?: Readonly<Record<string, {file: string, weight: string}>>}} [opts]
 */
export function prepareHtml(
  html,
  { assetBase, fontDir = FONT_DIR, localFonts = LOCAL_FONTS } = {}
) {
  const faces = Object.entries(localFonts)
    .filter(([, f]) => existsSync(join(fontDir, f.file)))
    .map(
      ([family, f]) =>
        `@font-face{font-family:"${family}";src:url("${pathToFileURL(join(fontDir, f.file)).href}") format("woff2");font-weight:${f.weight};font-style:normal;font-display:block}`
    )
    .join('\n');
  const localNames = new Set(Object.keys(localFonts));
  let out = html.replace(
    /<link[^>]+fonts\.googleapis\.com\/css2\?family=([^"&]+)[^>]*>/g,
    (tag, fam) => {
      const family = decodeURIComponent(fam).split(':')[0].replace(/\+/g, ' ');
      return localNames.has(family)
        ? ''
        : tag.replace('display=swap', 'display=block');
    }
  );
  out = out.replace(
    /<link[^>]+fonts\.(googleapis|gstatic)\.com"[^>]*\/?>/g,
    m => (/preconnect/.test(m) ? m : '')
  );
  if (assetBase) {
    const abs = p =>
      /^(data:|https?:|file:)/.test(p) || isAbsolute(p)
        ? p
        : pathToFileURL(join(assetBase, p)).href;
    out = out.replace(
      /url\((['"]?)([^'")]+)\1\)/g,
      (_, q, p) => `url(${q}${abs(p)}${q})`
    );
    out = out.replace(
      /(<img[^>]*\ssrc=")([^"]+)"/g,
      (_, pre, p) => `${pre}${abs(p)}"`
    );
  }
  return out.replace(
    '</head>',
    `<style>${faces}\nhtml,body{-webkit-font-smoothing:antialiased}</style>\n</head>`
  );
}

/** In-page: waits for fonts and images, then audits every used family. */
async function settle() {
  await document.fonts.ready;
  const urls = new Set();
  for (const el of document.querySelectorAll('*')) {
    const bg = getComputedStyle(el).backgroundImage;
    for (const m of bg.matchAll(/url\("?([^")]+)"?\)/g)) urls.add(m[1]);
  }
  const imgFail = [];
  await Promise.all([
    ...[...document.images].map(img =>
      img.decode().catch(() => imgFail.push(img.currentSrc || img.src))
    ),
    ...[...urls].map(
      u =>
        new Promise(res => {
          const i = new Image();
          i.onload = res;
          i.onerror = () => {
            imgFail.push(u);
            res();
          };
          i.src = u;
        })
    ),
  ]);
  const families = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!t.textContent.trim()) continue;
    const cs = getComputedStyle(t.parentElement);
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (!families.has(fam))
      families.set(fam, {
        weight: cs.fontWeight,
        sample: t.textContent.trim().slice(0, 12),
      });
  }
  const generic = new Set([
    'system-ui',
    'sans-serif',
    'serif',
    'monospace',
    'ui-monospace',
    '-apple-system',
  ]);
  for (const [fam, f] of families)
    if (!generic.has(fam))
      await document.fonts
        .load(`${f.weight} 16px "${fam}"`, f.sample)
        .catch(() => {});
  const missingFonts = [...families]
    .filter(
      ([fam, f]) =>
        !generic.has(fam) &&
        !document.fonts.check(`${f.weight} 16px "${fam}"`, f.sample)
    )
    .map(([fam]) => fam);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const root = document.body.firstElementChild;
  const box = root.getBoundingClientRect();
  return {
    missingFonts,
    imgFail,
    families: [...families.keys()],
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

/**
 * Renders exported Pen HTML files to PNG. jobs = [{htmlPath, outPath}].
 * Returns [{outPath, ok, problems[], audit}]. One browser per batch.
 * @param {{htmlPath: string, outPath: string}[]} jobs
 * @param {{assetBase?: string, scale?: number, timeoutMs?: number}} [opts]
 */
export async function renderHtmlFiles(
  jobs,
  { assetBase, scale = 1, timeoutMs = 60_000 } = {}
) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    executablePath: process.env.PEN_REVIEW_CHROMIUM || undefined,
  });
  const results = [];
  try {
    for (const job of jobs) {
      const prepared = job.htmlPath.replace(/\.html$/, '.render.html');
      writeFileSync(
        prepared,
        prepareHtml(readFileSync(job.htmlPath, 'utf8'), { assetBase })
      );
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1200 },
        deviceScaleFactor: scale,
      });
      try {
        await page.goto(pathToFileURL(prepared).href, {
          waitUntil: 'load',
          timeout: timeoutMs,
        });
        const audit = await page.evaluate(settle);
        await page.setViewportSize({
          width: Math.max(audit.width, 1),
          height: Math.max(audit.height, 1),
        });
        await page.evaluate(
          () =>
            new Promise(r =>
              requestAnimationFrame(() => requestAnimationFrame(r))
            )
        );
        await page
          .locator('body > *:first-child')
          .screenshot({ path: job.outPath, animations: 'disabled' });
        const problems = [
          ...audit.missingFonts.map(f => `font not loaded: ${f}`),
          ...audit.imgFail.map(u => `image not loaded: ${u}`),
        ];
        results.push({
          outPath: job.outPath,
          ok: problems.length === 0,
          problems,
          audit,
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}
