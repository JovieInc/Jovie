import type { Page } from '@playwright/test';
import type { RouteDomFinding } from './route-dom-detector';

/** Near-uniform pixels: luma stddev under this (0-255) reads as blank. */
export const BLANK_MEDIA_LUMA_STDDEV_MAX = 3;
/** ...and at least this share of pixels sit within 6 levels of the mean. */
export const BLANK_MEDIA_DOMINANT_SHARE_MIN = 0.985;
/**
 * How far a 16x16 cell's mean luma must sit from the field's median cell to
 * count as ink departing from an otherwise empty field.
 */
export const BLANK_MEDIA_INK_DEPARTURE_MIN = 16;
/**
 * Share of 16x16 grid cells that carry content — local luma or chroma
 * variance, or a mean departing from the field — below which the media has
 * no discernible content anywhere and reads as blank.
 */
export const BLANK_MEDIA_CONTENT_CELL_SHARE_MIN = 0.02;
const BLANK_MEDIA_MAX_PROBES = 16;
/**
 * How long to let a probed image finish loading and decoding before its pixels
 * are judged. A receipt starts at domcontentloaded, so a priority hero from a
 * cold image optimizer, or a lazy image the probe just scrolled to, can still
 * be in flight; judging it then reads the slot's own background as blank. An
 * image still loading after this is judged as it stands, so a slow or stuck
 * image is still a finding.
 */
export const BLANK_MEDIA_LOAD_WAIT_MS = 5000;

/**
 * Blank-media: an img, video or canvas inside a designed section (a
 * [data-pen-section], else any top-level section) whose rendered pixels show
 * no discernible content. Pixels come from an element screenshot decoded in
 * the page, so what is judged is what a visitor sees (object-fit, poster,
 * canvas draw), not naturalWidth. Opt out with data-decorative or
 * data-dom-certification.
 *
 * Blank requires near-uniform pixels, or a frame with no discernible content:
 * fewer than BLANK_MEDIA_CONTENT_CELL_SHARE_MIN of its cells vary locally in
 * luma or chroma, or depart from the field's median luma. The earlier
 * local-flat-cell count (emptyShare >= 0.6) was measured on 2026-11-10 to
 * flag loaded, content-bearing media: dark product screenshots (a Noir-Ion
 * profile capture reads 62-79% locally-flat cells) and chromatic gradient
 * artwork (100% luma-flat cells over a real chroma spread). Those measure
 * 21-100% content cells and pass; a solid slot and a speck on a flat field
 * (1.6%) still read as blank.
 */
export async function inspectBlankMedia(
  page: Page
): Promise<RouteDomFinding[]> {
  const probes = await page.evaluate(max => {
    const marked = Array.from(document.querySelectorAll('[data-pen-section]'));
    const root = document.querySelector('main') ?? document.body;
    const sections =
      marked.length > 0
        ? marked
        : Array.from(root.querySelectorAll('section, article'));
    const seen = new Set<Element>();
    const out: { id: number; label: string; broken: boolean }[] = [];
    for (const section of sections) {
      for (const media of Array.from(
        section.querySelectorAll('img, video, canvas')
      )) {
        if (seen.has(media) || out.length >= max) continue;
        seen.add(media);
        if (
          media.closest(
            '[data-decorative], [data-dom-certification="ignore"], [aria-hidden="true"], [hidden]'
          )
        )
          continue;
        const style = getComputedStyle(media);
        const rect = media.getBoundingClientRect();
        if (
          rect.width < 120 ||
          rect.height < 80 ||
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number.parseFloat(style.opacity || '1') === 0
        )
          continue;
        const id = out.length;
        media.setAttribute('data-blank-probe', String(id));
        const tag = media.tagName.toLowerCase();
        const sectionName =
          section.getAttribute('data-pen-section') ??
          section.tagName.toLowerCase();
        const label =
          tag === 'img'
            ? `img[src="${(media.getAttribute('src') ?? '').slice(0, 80)}"] in ${sectionName}`
            : `${tag} in ${sectionName}`;
        out.push({
          id,
          label,
          broken:
            media instanceof HTMLImageElement &&
            media.complete &&
            media.naturalWidth === 0,
        });
      }
    }
    return out;
  }, BLANK_MEDIA_MAX_PROBES);

  const findings: RouteDomFinding[] = [];
  for (const probe of probes) {
    if (probe.broken) {
      findings.push({
        kind: 'blank-media',
        message: 'Media failed to load (naturalWidth 0), so the slot is blank.',
        elements: [probe.label],
      });
      continue;
    }
    const media = page.locator(`[data-blank-probe="${probe.id}"]`);
    let png: Buffer;
    try {
      await media.scrollIntoViewIfNeeded({ timeout: 5000 });
      await media.evaluate(async (node, waitMs) => {
        if (!(node instanceof HTMLImageElement)) return;
        const loaded = node.complete
          ? Promise.resolve()
          : new Promise<void>(resolve => {
              node.addEventListener('load', () => resolve(), { once: true });
              node.addEventListener('error', () => resolve(), { once: true });
            });
        await Promise.race([
          loaded
            .then(() => (node.naturalWidth > 0 ? node.decode() : undefined))
            .catch(() => undefined),
          new Promise(resolve => setTimeout(resolve, waitMs)),
        ]);
        // The judged pixels come from an element screenshot, which copies the
        // compositor's most recent frame — load and decode() alone do not
        // guarantee that frame already carries the decoded bitmap (the same
        // stale-frame class the contrast detector captures atomically). Let a
        // frame that includes the decoded image commit before the capture.
        await new Promise(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
      }, BLANK_MEDIA_LOAD_WAIT_MS);
      png = await media.screenshot({ animations: 'disabled', timeout: 5000 });
    } catch {
      continue;
    }
    const stats = await page.evaluate(async b64 => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${b64}`)).blob()
      );
      const side = 128;
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, side, side);
      const { data } = context.getImageData(0, 0, side, side);
      const lumas: number[] = [];
      const chromas: number[] = [];
      for (let index = 0; index < data.length; index += 4) {
        const red = data[index] ?? 0;
        const green = data[index + 1] ?? 0;
        const blue = data[index + 2] ?? 0;
        lumas.push(0.2126 * red + 0.7152 * green + 0.0722 * blue);
        chromas.push(Math.max(red, green, blue) - Math.min(red, green, blue));
      }
      const mean = lumas.reduce((sum, v) => sum + v, 0) / lumas.length;
      const variance =
        lumas.reduce((sum, v) => sum + (v - mean) ** 2, 0) / lumas.length;
      const dominant =
        lumas.filter(v => Math.abs(v - mean) <= 6).length / lumas.length;
      const grid = 16;
      const cell = side / grid;
      const cellMeans: number[] = [];
      const cellLumaStddev: number[] = [];
      const cellChromaStddev: number[] = [];
      for (let gy = 0; gy < grid; gy += 1) {
        for (let gx = 0; gx < grid; gx += 1) {
          const lumaValues: number[] = [];
          const chromaValues: number[] = [];
          for (let y = 0; y < cell; y += 1) {
            for (let x = 0; x < cell; x += 1) {
              const at = (gy * cell + y) * side + gx * cell + x;
              lumaValues.push(lumas[at] ?? 0);
              chromaValues.push(chromas[at] ?? 0);
            }
          }
          const lumaMean =
            lumaValues.reduce((sum, v) => sum + v, 0) / lumaValues.length;
          cellMeans.push(lumaMean);
          cellLumaStddev.push(
            Math.sqrt(
              lumaValues.reduce((sum, v) => sum + (v - lumaMean) ** 2, 0) /
                lumaValues.length
            )
          );
          const chromaMean =
            chromaValues.reduce((sum, v) => sum + v, 0) / chromaValues.length;
          cellChromaStddev.push(
            Math.sqrt(
              chromaValues.reduce((sum, v) => sum + (v - chromaMean) ** 2, 0) /
                chromaValues.length
            )
          );
        }
      }
      const sortedMeans = [...cellMeans].sort((a, b) => a - b);
      const fieldMedian = sortedMeans[sortedMeans.length >> 1] ?? mean;
      let contentCells = 0;
      for (let index = 0; index < cellMeans.length; index += 1) {
        const varies =
          (cellLumaStddev[index] ?? 0) >= 2.5 ||
          (cellChromaStddev[index] ?? 0) >= 2.5;
        // BLANK_MEDIA_INK_DEPARTURE_MIN, inlined: this closure runs in the
        // page, where module scope does not exist.
        const ink = Math.abs((cellMeans[index] ?? 0) - fieldMedian) >= 16;
        if (varies || ink) contentCells += 1;
      }
      return {
        stddev: Math.sqrt(variance),
        dominant,
        mean,
        contentShare: contentCells / (grid * grid),
      };
    }, png.toString('base64'));
    if (!stats) continue;
    if (stats.contentShare < BLANK_MEDIA_CONTENT_CELL_SHARE_MIN) {
      findings.push({
        kind: 'blank-media',
        message: `Media shows no discernible content: only ${Math.round(stats.contentShare * 100)}% of its cells vary from an empty field.`,
        elements: [probe.label],
        measurements: {
          contentShare: Math.round(stats.contentShare * 1000) / 1000,
        },
      });
      continue;
    }
    if (
      stats.stddev < BLANK_MEDIA_LUMA_STDDEV_MAX &&
      stats.dominant >= BLANK_MEDIA_DOMINANT_SHARE_MIN
    ) {
      findings.push({
        kind: 'blank-media',
        message: `Media renders near-uniform pixels (luma stddev ${stats.stddev.toFixed(2)}), so the slot reads as empty.`,
        elements: [probe.label],
        measurements: {
          lumaStddev: Math.round(stats.stddev * 100) / 100,
          dominantShare: Math.round(stats.dominant * 1000) / 1000,
        },
      });
    }
  }
  await page.evaluate(() => {
    for (const node of Array.from(
      document.querySelectorAll('[data-blank-probe]')
    ))
      node.removeAttribute('data-blank-probe');
  });
  return findings;
}
