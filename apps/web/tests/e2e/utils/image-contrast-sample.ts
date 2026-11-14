// Split from image-contrast-detector.ts. That file is pinned at 529 lines in
// scripts/company-guards/size-baseline.json and may not grow. Candidate
// discovery and the WCAG verdict stay in the detector; sharp sampling, the
// capture-time box re-read, and the diagnostic pixel grid live here.

import type { Page } from '@playwright/test';
import sharp from 'sharp';

export interface ContrastBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function parseCssColor(
  color: string
): { r: number; g: number; b: number } | null {
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(color);
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  };
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * (sorted.length - 1)))
  );
  return sorted[index];
}

export async function sampleRegionLuminances(
  screenshot: Buffer,
  box: ContrastBox,
  scale: number
): Promise<number[]> {
  const left = Math.max(0, Math.floor(box.x * scale));
  const top = Math.max(0, Math.floor(box.y * scale));
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  const { data, info } = await sharp(screenshot)
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const luminances: number[] = [];
  const stride = Math.max(1, Math.floor((width * height) / 20000));
  const channels = info.channels;
  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const offset = pixel * channels;
    luminances.push(
      relativeLuminance(data[offset], data[offset + 1], data[offset + 2])
    );
  }
  return luminances.sort((a, b) => a - b);
}

// Diagnostic: a coarse hex grid over the sampled box so a failing finding
// names the actual painted pixels (JOV-11623 painter identification).
export async function sampleRegionPixelGrid(
  screenshot: Buffer,
  box: ContrastBox,
  scale: number,
  columns = 8,
  rows = 3
): Promise<string[]> {
  const left = Math.max(0, Math.floor(box.x * scale));
  const top = Math.max(0, Math.floor(box.y * scale));
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  const { data, info } = await sharp(screenshot)
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const cells: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    const py = Math.min(height - 1, Math.round(((row + 0.5) / rows) * height));
    const line: string[] = [];
    for (let column = 0; column < columns; column += 1) {
      const px = Math.min(
        width - 1,
        Math.round(((column + 0.5) / columns) * width)
      );
      const offset = (py * width + px) * channels;
      const hex = (value: number) => value.toString(16).padStart(2, '0');
      line.push(
        `#${hex(data[offset])}${hex(data[offset + 1])}${hex(data[offset + 2])}`
      );
    }
    cells.push(line.join(' '));
  }
  return cells;
}

// Diagnostic: the hit-test stack (top three, described) at each grid column
// of the sampled box's middle row, so a failing finding names the elements
// that actually paint there (JOV-11623).
export async function sampleRegionStacks(
  page: Page,
  box: ContrastBox,
  columns = 8
): Promise<string[]> {
  return page.evaluate(
    ({ box, columns }) => {
      const describe = (element: Element): string => {
        const parts: string[] = [];
        let node: Element | null = element;
        for (let depth = 0; node && depth < 3; depth += 1) {
          const testId = node.getAttribute('data-testid');
          const label = testId
            ? `${node.tagName.toLowerCase()}#${testId}`
            : node.id
              ? `${node.tagName.toLowerCase()}#${node.id}`
              : node.tagName.toLowerCase();
          parts.push(label);
          node = node.parentElement;
        }
        return parts.join(' > ');
      };
      const points: string[] = [];
      for (let column = 0; column < columns; column += 1) {
        const px = Math.round(box.x + ((column + 0.5) / columns) * box.width);
        const py = Math.round(box.y + box.height / 2);
        const stack = document.elementsFromPoint(px, py).slice(0, 3);
        points.push(`x${px}: ${stack.map(describe).join(' | ')}`);
      }
      return points;
    },
    { box, columns }
  );
}

export async function readContrastHideBoxes(
  page: Page,
  hideAttribute: string
): Promise<Record<string, ContrastBox>> {
  return page.evaluate(attribute => {
    const boxes: Record<string, ContrastBox> = {};
    for (const element of Array.from(
      document.querySelectorAll(`[${attribute}]`)
    )) {
      const index = element.getAttribute(attribute);
      if (index === null) continue;
      const rect = element.getBoundingClientRect();
      boxes[index] = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    }
    return boxes;
  }, hideAttribute);
}

// The hide stylesheet, injected AT the screenshot (Playwright's `style`
// option guarantees it applies to the copied frame): an addStyleTag + rAF
// capture can copy a stale compositor frame still carrying pre-hide ink —
// the identical bright pixels every dispatch kept sampling behind the
// desktop footer credit (JOV-11623). Glyph ink is stripped in every form
// (color, text-shadow/stroke, SVG fill/stroke, the link's underline);
// solid control fills (background-color) stay painted so the sampled
// region is exactly what sits behind each glyph.
export const CONTRAST_HIDE_STYLE =
  '[data-image-contrast-hide], [data-image-contrast-hide] * { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: transparent !important; caret-color: transparent !important; background-image: none !important; fill: transparent !important; stroke: transparent !important; text-decoration: none !important; text-decoration-color: transparent !important; }';

// Capture-time evidence for one inspection pass: the candidate boxes are
// re-read after the scan (late-loading media reflows the page between the
// scan and the capture, JOV-11623) and the screenshot carries the hide.
export async function captureContrastEvidence(
  page: Page,
  candidateAttribute: string
): Promise<{ screenshot: Buffer; freshBoxes: Record<string, ContrastBox> }> {
  const freshBoxes = await readContrastHideBoxes(page, candidateAttribute);
  const screenshot = await captureContrastScreenshot(page, CONTRAST_HIDE_STYLE);
  return { screenshot, freshBoxes };
}

export async function captureContrastScreenshot(
  page: Page,
  hideStyle: string
): Promise<Buffer> {
  // Headless Chromium rejects a capture with "Protocol error
  // (Page.captureScreenshot): Unable to capture screenshot" when the view has
  // no compositor frame to copy yet. Deliberate-red fixtures call
  // page.setContent on a fresh page and capture within milliseconds, racing
  // that first frame; on a contended Linux runner the frame can lag long
  // enough that three back-to-back retries all lose (merge group, 10-12).
  // Wait for a committed frame before every capture, and retry only that
  // transient with backoff, at most three times; any other error, or a
  // fourth failure, fails.
  const waitForCommittedFrame = () =>
    page.evaluate(
      () =>
        new Promise<void>(resolve => {
          // A hidden page never runs rAF; the timer keeps this bounded.
          const fallback = setTimeout(resolve, 1_000);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              clearTimeout(fallback);
              resolve();
            })
          );
        })
    );
  for (let attempt = 1; ; attempt++) {
    await waitForCommittedFrame();
    try {
      // `style` injects the hide AT the capture: Playwright guarantees the
      // stylesheet applies to the frame being copied, so the screenshot can
      // never show pre-hide ink from a stale compositor frame (JOV-11623).
      return await page.screenshot({
        type: 'png',
        style: hideStyle,
        animations: 'disabled',
      });
    } catch (error) {
      if (
        attempt >= 4 ||
        !String(error).includes('Unable to capture screenshot')
      ) {
        throw error;
      }
      await page.waitForTimeout(250 * 2 ** (attempt - 1));
    }
  }
}

// Diagnostic (JOV-11623): a failing verdict means the sampled background
// behind the glyphs is brighter than the painted surface — either a real
// bright background or leftover ink the hide never covered. The pixel grid
// and stacks name sample points, not painters. This census walks the
// hit-test stack (pointer-events forced, like the candidate scan) at the
// brightest sampled pixels and records every element that can paint there
// with the computed styles and pseudo-element ink that decide which one
// did. It runs only for failing candidates, after the hide style is
// removed, so recorded colors are the real rendered ones.
export async function sampleRegionPainters(
  screenshot: Buffer,
  page: Page,
  box: ContrastBox,
  scale: number,
  hideAttribute: string
): Promise<Record<string, unknown>> {
  const left = Math.max(0, Math.floor(box.x * scale));
  const top = Math.max(0, Math.floor(box.y * scale));
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  const { data, info } = await sharp(screenshot)
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const hexAt = (pixel: number): string => {
    const offset = pixel * channels;
    const hex = (value: number) => value.toString(16).padStart(2, '0');
    return `#${hex(data[offset])}${hex(data[offset + 1])}${hex(data[offset + 2])}`;
  };
  const bright: Array<{
    cssX: number;
    cssY: number;
    lum: number;
    hex: string;
  }> = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * channels;
      const lum = relativeLuminance(
        data[offset],
        data[offset + 1],
        data[offset + 2]
      );
      if (lum < 0.08) continue;
      bright.push({
        cssX: box.x + x / scale,
        cssY: box.y + y / scale,
        lum: Math.round(lum * 1000) / 1000,
        hex: hexAt(pixel),
      });
    }
  }
  bright.sort((a, b) => b.lum - a.lum);
  // Spread the census points so a single glyph cannot monopolize them.
  const points: typeof bright = [];
  for (const candidate of bright) {
    if (
      points.length >= 10 ||
      points.every(
        point =>
          Math.hypot(point.cssX - candidate.cssX, point.cssY - candidate.cssY) >
          4
      )
    ) {
      if (points.length < 10) points.push(candidate);
      if (points.length >= 10) break;
    }
  }
  const censusPoints = points.map(point => ({
    x: Math.round(point.cssX),
    y: Math.round(point.cssY),
    hex: point.hex,
    lum: point.lum,
  }));
  const summary = {
    brightPixelCount: bright.length,
    brightestHexes: [...new Set(bright.map(pixel => pixel.hex))].slice(0, 12),
    sampledPoints: censusPoints,
    stacks: await page.evaluate(
      ({ points: censusPoints, hideAttribute: attribute }) => {
        const override = document.createElement('style');
        override.textContent = '*{pointer-events:auto!important}';
        document.head.appendChild(override);
        try {
          return censusPoints.map(point => {
            const stack = document
              .elementsFromPoint(point.x, point.y)
              .slice(0, 8);
            return {
              at: `${Math.round(point.x)},${Math.round(point.y)} ${point.hex}`,
              painters: stack.map(element => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                const pseudo = (name: string): string | null => {
                  const cs = getComputedStyle(element, name);
                  const content = cs.content;
                  if (!content || content === 'none' || content === 'normal')
                    return null;
                  return `${name} content=${String(content).slice(0, 40)} color=${cs.color} bg=${cs.backgroundColor} bgImg=${cs.backgroundImage === 'none' ? 'none' : cs.backgroundImage.slice(0, 80)}`;
                };
                let hideTagged = false;
                for (
                  let node: Element | null = element;
                  node;
                  node = node.parentElement
                ) {
                  if (node.hasAttribute(attribute)) {
                    hideTagged = true;
                    break;
                  }
                }
                const testId = element.getAttribute('data-testid');
                return {
                  tag: testId
                    ? `${element.tagName.toLowerCase()}#${testId}`
                    : element.tagName.toLowerCase(),
                  cls: (element.getAttribute('class') ?? '').slice(0, 120),
                  rect: `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`,
                  color: style.color,
                  bg: style.backgroundColor,
                  bgImg:
                    style.backgroundImage === 'none'
                      ? 'none'
                      : style.backgroundImage.slice(0, 80),
                  opacity: style.opacity,
                  zIndex: style.zIndex,
                  position: style.position,
                  hideTagged,
                  text: (element.textContent ?? '').trim().slice(0, 40),
                  pseudos: [pseudo('::before'), pseudo('::after')].filter(
                    (value): value is string => value !== null
                  ),
                };
              }),
            };
          });
        } finally {
          override.remove();
        }
      },
      { points: censusPoints, hideAttribute }
    ),
  };
  return summary;
}
