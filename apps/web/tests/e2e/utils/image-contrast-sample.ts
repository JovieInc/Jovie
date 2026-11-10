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

export async function captureContrastScreenshot(page: Page): Promise<Buffer> {
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
      return await page.screenshot({ type: 'png' });
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
