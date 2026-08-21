import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { renderMockup } from './artwork';

async function buildPrintFile(): Promise<Buffer> {
  return sharp(
    Buffer.from(`<svg width="4500" height="5400" viewBox="0 0 4500 5400" xmlns="http://www.w3.org/2000/svg">
      <rect width="4500" height="5400" fill="none"/>
      <rect x="720" y="920" width="3060" height="3560" rx="80" fill="none" stroke="#f3f3f0" stroke-width="48"/>
      <text x="2250" y="1700" text-anchor="middle" font-family="Arial, sans-serif" font-size="320" font-weight="900" fill="#f3f3f0">LUNA</text>
      <text x="2250" y="2280" text-anchor="middle" font-family="Arial, sans-serif" font-size="560" font-weight="900" fill="#f3f3f0">WAVES</text>
      <text x="2250" y="2920" text-anchor="middle" font-family="Arial, sans-serif" font-size="190" font-weight="800" fill="#f3f3f0">SIGNAL OBJECT</text>
    </svg>`)
  )
    .png()
    .toBuffer();
}

async function sampleChest(mockup: Buffer): Promise<{
  readonly r: number;
  readonly g: number;
  readonly b: number;
}> {
  const { data } = await sharp(mockup)
    .extract({ left: 820, top: 980, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0 };
}

describe('renderMockup', () => {
  it('renders distinct product-aware fallback mockups', async () => {
    const printFile = await buildPrintFile();

    const [tee, hoodie, hat] = await Promise.all([
      renderMockup(printFile, 'premium tee'),
      renderMockup(printFile, 'premium hoodie'),
      renderMockup(printFile, 'structured dad hat'),
    ]);

    for (const mockup of [tee, hoodie, hat]) {
      const metadata = await sharp(mockup).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.width).toBe(1800);
      expect(metadata.height).toBe(2200);
      expect(mockup.length).toBeGreaterThan(10_000);
    }

    expect(tee.equals(hoodie)).toBe(false);
    expect(tee.equals(hat)).toBe(false);
    expect(hoodie.equals(hat)).toBe(false);
  });

  it('keeps a generated full-bleed graphic visible on the garment', async () => {
    const [design, empty] = await Promise.all([
      sharp({
        create: {
          width: 1024,
          height: 1024,
          channels: 4,
          background: { r: 255, g: 0, b: 255, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
      sharp({
        create: {
          width: 1024,
          height: 1024,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer(),
    ]);

    const [composited, blank] = await Promise.all([
      renderMockup(design, 'premium tee'),
      renderMockup(empty, 'premium tee'),
    ]);

    const designedChest = await sampleChest(composited);
    const blankChest = await sampleChest(blank);

    expect(designedChest.r).toBeGreaterThan(200);
    expect(designedChest.b).toBeGreaterThan(200);
    expect(designedChest.g).toBeLessThan(40);
    expect(blankChest.r).toBeLessThan(80);
    expect(designedChest).not.toEqual(blankChest);
  });
});
