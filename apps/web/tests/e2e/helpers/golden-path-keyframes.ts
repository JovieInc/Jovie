/**
 * JOV-5489: deterministic golden-path keyframes for visual review.
 *
 * Each keyframe is a fixed-viewport screenshot (animations disabled) plus a
 * deterministic in-page layout audit taken at the same instant (reviewer B).
 * Enabled only when GOLDEN_PATH_KEYFRAME_DIR is set, so ordinary runs are
 * untouched. Manifest: one JSON line per keyframe in <dir>/manifest.jsonl.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export const GOLDEN_PATH_KEYFRAME_SCHEMA = 'jovie.golden-path-keyframe/v1';

export interface LayoutAudit {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly overflowPx: number;
  readonly offscreenInteractive: readonly string[];
  readonly smallTargets: readonly string[];
  readonly brokenImages: readonly string[];
}

export interface KeyframeRecord {
  readonly schema: typeof GOLDEN_PATH_KEYFRAME_SCHEMA;
  readonly id: string;
  readonly sequence: number;
  readonly url: string;
  readonly file: string;
  readonly sha256: string;
  readonly audit: LayoutAudit;
  readonly pageErrors: readonly string[];
}

const pageErrors = new WeakMap<Page, string[]>();
let sequence = 0;

function trackErrors(page: Page): string[] {
  let errors = pageErrors.get(page);
  if (!errors) {
    errors = [];
    pageErrors.set(page, errors);
    const list = errors;
    page.on('pageerror', error => list.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') list.push(message.text().slice(0, 300));
    });
  }
  return errors;
}

/**
 * Runs in the browser. Plain JavaScript source on purpose: TS transpilers
 * (esbuild keepNames) inject helpers such as __name into serialized function
 * bodies, which do not exist in the page and make page.evaluate throw.
 */
export const LAYOUT_AUDIT_SOURCE = `(() => {
  const describe = el => {
    const label = el.getAttribute('aria-label') || el.getAttribute('data-testid') || (el.textContent || '').trim().slice(0, 40);
    return el.tagName.toLowerCase() + ' "' + label + '"';
  };
  const insideScroller = el => {
    for (let node = el.parentElement; node; node = node.parentElement) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden') return true;
    }
    return false;
  };
  const visible = el => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
  };
  const width = window.innerWidth;
  const interactive = Array.from(document.querySelectorAll(
    'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea'
  )).filter(visible);
  const offscreenInteractive = interactive.filter(el => {
    const box = el.getBoundingClientRect();
    return (box.right > width + 1 || box.left < -1) && getComputedStyle(el).position !== 'fixed' && !insideScroller(el);
  }).map(describe);
  // WCAG 2.2 SC 2.5.8: inline links inside running text are exempt.
  const smallTargets = interactive.filter(el => {
    const box = el.getBoundingClientRect();
    if (box.width >= 24 && box.height >= 24) return false;
    return getComputedStyle(el).display !== 'inline';
  }).map(el => {
    const box = el.getBoundingClientRect();
    return describe(el) + ' ' + Math.round(box.width) + 'x' + Math.round(box.height);
  });
  const brokenImages = Array.from(document.images)
    .filter(img => img.complete && img.naturalWidth === 0 && visible(img))
    .map(img => (img.currentSrc || img.src).slice(0, 160));
  const scrollWidth = document.scrollingElement ? document.scrollingElement.scrollWidth : width;
  return {
    viewport: { width, height: window.innerHeight },
    overflowPx: Math.max(0, scrollWidth - width),
    offscreenInteractive,
    smallTargets,
    brokenImages,
  };
})()`;

/** Starts collecting console/page errors so the first keyframe sees them too. */
export function watchKeyframeErrors(page: Page): void {
  if (process.env.GOLDEN_PATH_KEYFRAME_DIR) trackErrors(page);
}

export async function captureKeyframe(page: Page, id: string): Promise<void> {
  const dir = process.env.GOLDEN_PATH_KEYFRAME_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const errors = trackErrors(page);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
    // A long-poll or analytics beacon must not block evidence capture.
  });
  sequence += 1;
  const file = `${String(sequence).padStart(2, '0')}-${id}.png`;
  const image = await page.screenshot({
    path: join(dir, file),
    animations: 'disabled',
    caret: 'hide',
    fullPage: false,
  });
  const record: KeyframeRecord = {
    schema: GOLDEN_PATH_KEYFRAME_SCHEMA,
    id,
    sequence,
    url: page.url(),
    file,
    sha256: createHash('sha256').update(image).digest('hex'),
    audit: (await page.evaluate(LAYOUT_AUDIT_SOURCE)) as LayoutAudit,
    pageErrors: errors.splice(0),
  };
  appendFileSync(join(dir, 'manifest.jsonl'), `${JSON.stringify(record)}\n`);
}
