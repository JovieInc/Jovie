import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  parseCssColor,
  percentile,
  relativeLuminance,
  sampleRegionLuminances,
  sampleRegionPixelGrid,
} from '../../e2e/utils/image-contrast-sample';

const box = { x: 0, y: 0, width: 2, height: 2 };

async function solidPng(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toBuffer();
}

describe('image contrast sampling', () => {
  it('reads a solid red box as one luminance and a hex grid of that paint', async () => {
    const png = await solidPng(255, 0, 0);
    const luminances = await sampleRegionLuminances(png, box, 1);
    const expected = relativeLuminance(255, 0, 0);

    expect(luminances.length).toBeGreaterThan(0);
    expect(luminances.every(value => value === expected)).toBe(true);
    expect(percentile(luminances, 90)).toBe(expected);

    const grid = await sampleRegionPixelGrid(png, box, 1, 2, 2);
    expect(grid).toEqual(['#ff0000 #ff0000', '#ff0000 #ff0000']);
  });

  it('parses rgb() ink and scores black-on-white at the WCAG ceiling', () => {
    expect(parseCssColor('rgb(255, 255, 255)')).toEqual({
      r: 255,
      g: 255,
      b: 255,
    });
    expect(parseCssColor('not-a-color')).toBeNull();
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 5);
    expect(percentile([], 90)).toBe(0);
  });
});
