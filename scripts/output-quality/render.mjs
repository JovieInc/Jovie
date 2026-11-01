// Render an artifact the way its audience meets it: visible text plus what the
// screen looks like. HTML files and URLs are opened in Chromium (dark mode
// first, the Jovie default) and captured at the first screen and full page;
// videos are sampled into frames; plain text stays text.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TEXT_EXT = new Set(['.txt', '.md', '.mdx', '.json', '.csv', '.eml']);
const HTML_EXT = new Set(['.html', '.htm']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov']);
const MAX_TEXT_CHARS = 24_000;
const MAX_FULL_PAGE_PX = 5400;

export const VIEWPORTS = Object.freeze({
  desktop: { width: 1440, height: 900, isMobile: false },
  mobile: { width: 390, height: 844, isMobile: true },
});

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/** What kind of artifact a reference is, from its scheme or extension. */
export function artifactType(ref) {
  if (/^https?:\/\//iu.test(ref)) return 'url';
  const ext = extname(ref).toLowerCase();
  if (HTML_EXT.has(ext)) return 'html';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (TEXT_EXT.has(ext) || !ext) return 'text';
  throw new Error(`unsupported artifact type: ${ext}`);
}

/** Visible text of an HTML document without a browser (scripts, styles and tags removed). */
export function htmlText(html) {
  return String(html)
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/giu, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n\s*\n+/gu, '\n')
    .trim();
}

function clip(text) {
  return text.length > MAX_TEXT_CHARS
    ? `${text.slice(0, MAX_TEXT_CHARS)}\n[... ${text.length - MAX_TEXT_CHARS} more characters not shown]`
    : text;
}

/** Capture screenshots and visible text with Playwright (loaded lazily). */
async function capturePage(url, outDir, viewports) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const images = [];
  let text = '';
  try {
    for (const name of viewports) {
      const view = VIEWPORTS[name];
      const page = await browser.newPage({
        viewport: { width: view.width, height: view.height },
        isMobile: view.isMobile,
        deviceScaleFactor: 1,
        colorScheme: 'dark',
      });
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
        await page.waitForTimeout(800);
        const first = join(outDir, `${name}-first-screen.png`);
        await page.screenshot({ path: first });
        images.push({
          label: `${name} first screen (what the reader sees before scrolling)`,
          path: first,
        });
        const height = await page.evaluate(
          () => document.documentElement.scrollHeight
        );
        if (height > view.height * 1.2) {
          // Cap the long capture so one image stays inside the relay budget.
          const shown = Math.min(height, MAX_FULL_PAGE_PX);
          const full = join(outDir, `${name}-full.png`);
          await page.screenshot({
            path: full,
            fullPage: true,
            clip: { x: 0, y: 0, width: view.width, height: shown },
          });
          images.push({
            label: `${name} page from the top, ${shown}px of ${height}px`,
            path: full,
          });
        }
        if (!text)
          text = await page.evaluate(() => document.body?.innerText ?? '');
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  return { images, text };
}

/** Sample up to `count` evenly spaced frames from a video with ffmpeg. */
function videoFrames(path, outDir, count = 6) {
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
    { encoding: 'utf8' }
  );
  const duration = Number(probe.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error(
      `could not read video duration: ${probe.stderr?.slice(0, 120)}`
    );
  const images = [];
  for (let i = 0; i < count; i++) {
    const at = ((i + 0.5) * duration) / count;
    const out = join(outDir, `frame-${String(i + 1).padStart(2, '0')}.png`);
    const run = spawnSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-ss',
      String(at),
      '-i',
      path,
      '-frames:v',
      '1',
      out,
    ]);
    if (run.status === 0 && existsSync(out))
      images.push({
        label: `video frame at ${at.toFixed(1)}s of ${duration.toFixed(1)}s`,
        path: out,
      });
  }
  return { images, text: '' };
}

/**
 * Render one artifact into { type, ref, sha256, text, images[] } under outDir.
 * @param {{ ref?: string, text?: string, outDir: string, viewports?: string[], capture?: typeof capturePage }} options
 */
export async function renderArtifact({
  ref,
  text: inlineText,
  outDir,
  viewports = ['desktop'],
  capture = capturePage,
}) {
  mkdirSync(outDir, { recursive: true });
  if (inlineText !== undefined) {
    writeFileSync(join(outDir, 'artifact.txt'), inlineText);
    return {
      type: 'text',
      ref: 'inline',
      sha256: sha256(inlineText),
      text: clip(inlineText),
      images: [],
    };
  }
  if (!ref) throw new Error('an artifact (file, URL or --text) is required');
  const type = artifactType(ref);
  if (type === 'url') {
    const page = await capture(ref, outDir, viewports);
    return {
      type,
      ref,
      sha256: sha256(page.text),
      text: clip(page.text),
      images: page.images,
    };
  }
  const path = resolve(ref);
  if (!existsSync(path) || !statSync(path).isFile())
    throw new Error(`artifact not found: ${ref}`);
  const bytes = readFileSync(path);
  const base = { type, ref: path, sha256: sha256(bytes) };
  if (type === 'text')
    return { ...base, text: clip(bytes.toString('utf8')), images: [] };
  if (type === 'image')
    return { ...base, text: '', images: [{ label: 'the artifact', path }] };
  if (type === 'video') return { ...base, ...videoFrames(path, outDir) };
  const page = await capture(pathToFileURL(path).href, outDir, viewports);
  return {
    ...base,
    text: clip(page.text || htmlText(bytes.toString('utf8'))),
    images: page.images,
  };
}
