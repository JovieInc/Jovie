/**
 * ASR-037: a heading wraps to at most 2 lines at 1440 and at 390 (Tim,
 * 2026-10-26: "3 lines is a violation. 2 max for headings."). Applies to
 * h1-h3 and elements with a display or heading text role. Lines are measured
 * as content-box height divided by line-height in a real browser.
 *
 *   node scripts/anti-slop/heading-lines.mjs <file.html|url> [...]    renders at 1440 and 390
 *
 * `run.mjs check --render --files page.html` runs the same pass, so Pen HTML
 * exports and founder artifacts are covered. Visual-capture passes call
 * measureHeadings(page) on pages they already have open.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MAX_LINES = 2;
export const VIEWPORTS = Object.freeze([
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]);
export const HEADING_SELECTOR =
  'h1, h2, h3, [data-text-role~="display"], [data-text-role~="heading"], [data-role~="display"], [data-role~="heading"]';

/** Lines from a content-box height and a line-height; tolerant of sub-pixel rounding. */
export function linesFor(contentHeight, lineHeight) {
  if (!(lineHeight > 0) || !(contentHeight > 0)) return 0;
  return Math.ceil(contentHeight / lineHeight - 0.15);
}

export function overLimit(measured, max = MAX_LINES) {
  return measured.filter(h => h.lines > max);
}

/** Runs inside the page. Returns one record per visible heading. */
export function measureInPage(selector) {
  const out = [];
  for (const el of document.querySelectorAll(selector)) {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (
      rect.width === 0 ||
      rect.height === 0 ||
      style.visibility === 'hidden' ||
      style.display === 'none'
    )
      continue;
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const lh =
      style.lineHeight === 'normal'
        ? fontSize * 1.2
        : Number.parseFloat(style.lineHeight);
    const pad =
      (Number.parseFloat(style.paddingTop) || 0) +
      (Number.parseFloat(style.paddingBottom) || 0) +
      (Number.parseFloat(style.borderTopWidth) || 0) +
      (Number.parseFloat(style.borderBottomWidth) || 0);
    out.push({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      height: rect.height - pad,
      lineHeight: lh,
    });
  }
  return out;
}

export async function measureHeadings(page, selector = HEADING_SELECTOR) {
  const raw = await page.evaluate(
    `(${measureInPage.toString()})(${JSON.stringify(selector)})`
  );
  return raw.map(h => ({ ...h, lines: linesFor(h.height, h.lineHeight) }));
}

async function loadChromium() {
  const requireFromWeb = createRequire(
    new URL('../../apps/web/package.json', import.meta.url)
  );
  return requireFromWeb('playwright').chromium;
}

/** Render a file or URL at both viewports; returns { failures, measured }. */
export async function checkTargets(targets, { browserType } = {}) {
  const chromium = browserType ?? (await loadChromium());
  const browser = await chromium.launch();
  const failures = [];
  const measured = [];
  try {
    for (const target of targets) {
      const url = /^https?:|^file:/u.test(target)
        ? target
        : pathToFileURL(resolve(target)).href;
      for (const viewport of VIEWPORTS) {
        const page = await browser.newPage({ viewport });
        try {
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
          });
          await page.evaluate('document.fonts && document.fonts.ready');
          await page.waitForTimeout(400);
          for (const h of await measureHeadings(page)) {
            measured.push({ target, width: viewport.width, ...h });
            if (h.lines > MAX_LINES)
              failures.push(
                `ASR-037 ${target} @${viewport.width}: <${h.tag}> wraps to ${h.lines} lines (max ${MAX_LINES}): "${h.text}"`
              );
          }
        } catch (error) {
          failures.push(
            `ASR-037 ${target} @${viewport.width}: could not measure (${String(error.message).split('\n')[0]})`
          );
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  return { failures, measured };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    process.stderr.write('usage: heading-lines.mjs <file.html|url> [...]\n');
    process.exitCode = 2;
  } else {
    const { failures, measured } = await checkTargets(targets);
    process.stdout.write(
      `measured ${measured.length} headings at ${VIEWPORTS.map(v => v.width).join('/')}\n`
    );
    if (failures.length) {
      process.stderr.write(`${failures.join('\n')}\n`);
      process.exitCode = 1;
    }
  }
}
