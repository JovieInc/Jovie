import type { Page } from '@playwright/test';
import type { RouteDomFinding } from './route-dom-detector';

/** Near-uniform pixels: luma stddev under this (0-255) reads as blank. */
export const BLANK_MEDIA_LUMA_STDDEV_MAX = 3;
/** ...and at least this share of pixels sit within 6 levels of the mean. */
export const BLANK_MEDIA_DOMINANT_SHARE_MIN = 0.985;
/** Share of 16x16 grid cells that are flat (stddev < 2.5) above which the media is mostly empty. */
export const BLANK_MEDIA_EMPTY_CELL_SHARE_MAX = 0.6;
const BLANK_MEDIA_MAX_PROBES = 16;

/**
 * Blank-media: an img, video or canvas inside a designed section (a
 * [data-pen-section], else any top-level section) whose rendered pixels are
 * near-uniform. Pixels come from an element screenshot decoded in the page, so
 * what is judged is what a visitor sees (object-fit, poster, canvas draw),
 * not naturalWidth. Opt out with data-decorative or data-dom-certification.
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
    let png: Buffer;
    try {
      png = await page
        .locator(`[data-blank-probe="${probe.id}"]`)
        .screenshot({ animations: 'disabled', timeout: 5000 });
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
      for (let index = 0; index < data.length; index += 4) {
        lumas.push(
          0.2126 * (data[index] ?? 0) +
            0.7152 * (data[index + 1] ?? 0) +
            0.0722 * (data[index + 2] ?? 0)
        );
      }
      const mean = lumas.reduce((sum, v) => sum + v, 0) / lumas.length;
      const variance =
        lumas.reduce((sum, v) => sum + (v - mean) ** 2, 0) / lumas.length;
      const dominant =
        lumas.filter(v => Math.abs(v - mean) <= 6).length / lumas.length;
      const grid = 16;
      const cell = side / grid;
      let flatCells = 0;
      for (let gy = 0; gy < grid; gy += 1) {
        for (let gx = 0; gx < grid; gx += 1) {
          const values: number[] = [];
          for (let y = 0; y < cell; y += 1) {
            for (let x = 0; x < cell; x += 1) {
              values.push(lumas[(gy * cell + y) * side + gx * cell + x] ?? 0);
            }
          }
          const cellMean =
            values.reduce((sum, v) => sum + v, 0) / values.length;
          const cellStd = Math.sqrt(
            values.reduce((sum, v) => sum + (v - cellMean) ** 2, 0) /
              values.length
          );
          if (cellStd < 2.5) flatCells += 1;
        }
      }
      return {
        stddev: Math.sqrt(variance),
        dominant,
        mean,
        emptyShare: flatCells / (grid * grid),
      };
    }, png.toString('base64'));
    if (!stats) continue;
    if (stats.emptyShare >= BLANK_MEDIA_EMPTY_CELL_SHARE_MAX) {
      findings.push({
        kind: 'blank-media',
        message: `Media is mostly empty: ${Math.round(stats.emptyShare * 100)}% of its area is flat pixels.`,
        elements: [probe.label],
        measurements: {
          emptyShare: Math.round(stats.emptyShare * 1000) / 1000,
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
