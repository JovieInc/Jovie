import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { renderDesktopAppIcon } from './generate-brand-assets';

const fixtureRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map(root => rm(root, { recursive: true }))
  );
});

async function renderIcon(size: number): Promise<sharp.Sharp> {
  const root = await mkdtemp(join(tmpdir(), 'jovie-desktop-icon-'));
  fixtureRoots.push(root);
  const output = join(root, `icon-${size}.png`);
  await renderDesktopAppIcon(output, size);
  return sharp(output);
}

async function alphaBounds(icon: sharp.Sharp): Promise<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}> {
  const { data, info } = await icon.raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] > 5) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

describe('renderDesktopAppIcon', () => {
  it('keeps the full-size macOS tile on the Apple icon safe area', async () => {
    const size = 512;
    const icon = await renderIcon(size);
    const bounds = await alphaBounds(icon);

    expect(bounds.maxX - bounds.minX + 1).toBe(Math.round(size * 0.8));
    expect(bounds.maxY - bounds.minY + 1).toBe(Math.round(size * 0.8));
    expect(
      Math.abs(bounds.minX - (size - 1 - bounds.maxX))
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(bounds.minY - (size - 1 - bounds.maxY))
    ).toBeLessThanOrEqual(1);
  });

  it('uses the legibility-weighted small-size footprint below 64px', async () => {
    const size = 32;
    const icon = await renderIcon(size);
    const metadata = await icon.metadata();
    const bounds = await alphaBounds(icon);

    expect(metadata.width).toBe(size);
    expect(metadata.height).toBe(size);
    expect(bounds.maxX - bounds.minX + 1).toBe(Math.round(size * 0.85));
    expect(bounds.maxY - bounds.minY + 1).toBe(Math.round(size * 0.85));
  });
});
