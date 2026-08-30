import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { optimizePngLosslessly } from './png-optimization';

const fixtureRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map(root => rm(root, { recursive: true }))
  );
});

async function fixturePath(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'jovie-png-optimization-'));
  fixtureRoots.push(root);
  return join(root, name);
}

describe('optimizePngLosslessly', () => {
  it('shrinks an uncompressed screenshot while preserving every pixel', async () => {
    const path = await fixturePath('capture.png');
    const width = 160;
    const height = 120;
    const pixels = Buffer.alloc(width * height * 4);

    for (let index = 0; index < pixels.length; index += 4) {
      const pixel = index / 4;
      pixels[index] = pixel % 251;
      pixels[index + 1] = Math.floor(pixel / width) % 241;
      pixels[index + 2] = (pixel * 7) % 239;
      pixels[index + 3] = pixel % 5 === 0 ? 128 : 255;
    }

    await sharp(pixels, {
      raw: { channels: 4, height, width },
    })
      .png({ compressionLevel: 0, palette: false })
      .toFile(path);

    const beforePixels = await sharp(path).raw().toBuffer();
    const result = await optimizePngLosslessly(path);
    const afterPixels = await sharp(path).raw().toBuffer();

    expect(result.rewritten).toBe(true);
    expect(result.afterBytes).toBeLessThan(result.beforeBytes);
    expect(afterPixels.equals(beforePixels)).toBe(true);
  });

  it('keeps an already-smaller encoding instead of growing it', async () => {
    const path = await fixturePath('palette.png');
    const width = 32;
    const height = 32;
    const pixels = Buffer.alloc(width * height * 3, 17);

    await sharp(pixels, {
      raw: { channels: 3, height, width },
    })
      .png({ compressionLevel: 9, effort: 10, palette: true })
      .toFile(path);

    const before = await readFile(path);
    const result = await optimizePngLosslessly(path);
    const after = await readFile(path);

    expect(result).toEqual({
      afterBytes: before.length,
      beforeBytes: before.length,
      rewritten: false,
    });
    expect(after.equals(before)).toBe(true);
  });
});
