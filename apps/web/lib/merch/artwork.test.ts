import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { renderMockup } from './artwork';

async function buildTransparentPrintFile(): Promise<Buffer> {
  return sharp({
    create: {
      width: 4500,
      height: 5400,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
}

async function buildDesignedPrintFile(): Promise<Buffer> {
  const chestArt = await sharp({
    create: {
      width: 3600,
      height: 4300,
      channels: 4,
      background: { r: 243, g: 243, b: 240, alpha: 255 },
    },
  })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: 4500,
      height: 5400,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: chestArt, left: 450, top: 420, blend: 'over' }])
    .png()
    .toBuffer();
}

describe('renderMockup', () => {
  it('composites the chest print onto the blank garment instead of leaving it empty', async () => {
    const blankGarmentOnly = await renderMockup(
      await buildTransparentPrintFile()
    );
    const composited = await renderMockup(await buildDesignedPrintFile());

    const blankChest = await sharp(blankGarmentOnly)
      .extract({ left: 620, top: 860, width: 560, height: 620 })
      .raw()
      .toBuffer();
    const designedChest = await sharp(composited)
      .extract({ left: 620, top: 860, width: 560, height: 620 })
      .raw()
      .toBuffer();

    let differentPixels = 0;
    for (let index = 0; index < blankChest.length; index += 1) {
      if (blankChest[index] !== designedChest[index]) {
        differentPixels += 1;
      }
    }

    expect(differentPixels).toBeGreaterThan(1_000);
  });
});
