import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decodePng } from '../invariants/pen-still-diff-lib.mjs';
import { CANONICAL_PEN, exportFramesHeadless, runPen } from './pen-bridge.mjs';
import { renderGuard } from './render-guard.mjs';
import { renderHtmlFiles } from './render-html.mjs';

const RENDER_RETRIES = 3;
const RENDER_RETRY_WAIT_MS = 4_000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Exports and guards one frame. Cold exports race font and image loading;
 * re-export after a wait until the guard is clean, else fail the render.
 */
export async function renderTrusted(
  id,
  dir,
  facts,
  {
    exporter = exportFramesHeadless,
    wait = sleep,
    htmlFallback = renderViaHtml,
    requireStable = exporter !== exportFramesHeadless,
  } = {}
) {
  // Root fix for the font race: Pen's first export after a load can draw before
  // web fonts (Material Symbols, Inter) arrive. An export is trusted only when
  // two consecutive exports are byte-identical AND the guard is clean, so a
  // half-loaded font can never be the render a judge sees.
  let last;
  let prevMd5 = null;
  const scales = [1, 1, 1, 0.5];
  for (let attempt = 0; attempt < RENDER_RETRIES + 1; attempt++) {
    const [r] = exporter([id], dir, { scale: scales[attempt] ?? 1 });
    const img = decodePng(r.buf);
    const bad = renderGuard(
      [{ id, md5: r.md5, img }],
      { [id]: facts },
      { dark: !/light/i.test(facts.name), scale: scales[attempt] ?? 1 }
    );
    last = {
      ...r,
      attempt,
      guard: bad,
      renderer:
        exporter === exportFramesHeadless ? 'pen-headless' : 'pen-raster',
      stable: !requireStable || prevMd5 === r.md5,
    };
    if (bad.length === 0 && last.stable) return last;
    prevMd5 = bad.length === 0 ? r.md5 : null;
    if (bad.length) await wait(RENDER_RETRY_WAIT_MS * (attempt + 1));
  }
  if (last.guard.length === 0)
    return {
      ...last,
      stable: false,
      guard: [
        'render did not stabilise across exports (fonts or images still loading)',
      ],
    };
  // Raster still untrusted (garbled readback): Chromium render of the html-css export.
  const html = await htmlFallback(id, dir);
  if (!html?.buf)
    return { ...last, guard: [...last.guard, ...(html?.problems ?? [])] };
  const img = decodePng(html.buf);
  const bad = [
    ...html.problems,
    ...renderGuard(
      [{ id, md5: html.md5, img }],
      {},
      { dark: !/light/i.test(facts.name) }
    ).map(b => b.reason),
  ];
  return {
    ...html,
    attempt: last.attempt + 1,
    guard: bad,
    renderer: 'chromium-html',
    rasterGuard: last.guard,
  };
}

async function renderViaHtml(id, dir) {
  try {
    const htmlPath = join(dir, `${id}.html`);
    runPen([
      `Export(${JSON.stringify([id])},"html-css",${JSON.stringify(htmlPath)})`,
    ]);
    const outPath = join(dir, `${id}.chromium.png`);
    const [res] = await renderHtmlFiles([{ htmlPath, outPath }], {
      assetBase: dirname(CANONICAL_PEN),
    });
    const buf = readFileSync(outPath);
    return {
      id,
      path: outPath,
      buf,
      md5: createHash('md5').update(buf).digest('hex'),
      problems: res.problems,
    };
  } catch (error) {
    return {
      id,
      path: null,
      buf: null,
      md5: null,
      problems: [
        `html fallback failed: ${String(error.message).slice(0, 160)}`,
      ],
    };
  }
}
