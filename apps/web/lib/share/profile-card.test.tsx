// @vitest-environment node
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import palette from '@/design/oklch-palette.json';
import { loadSatoshiFont, OG_SIZE } from './image-utils';
import { renderProfileShareCard } from './profile-card';

async function render(
  name: string,
  image?: { dataUrl: string; width: number; height: number }
) {
  const response = new ImageResponse(
    renderProfileShareCard({ name, handle: 'maya-vale', image }),
    {
      ...OG_SIZE,
      fonts: [
        {
          name: 'Satoshi',
          data: await loadSatoshiFont(),
          weight: 700,
          style: 'normal',
        },
      ],
    }
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(bytes.length).toBeLessThan(1024 * 1024);
  expect(await sharp(bytes).metadata()).toMatchObject({
    format: 'png',
    width: 1200,
    height: 630,
    hasAlpha: true,
  });
  return bytes;
}

describe('profile preview pixels', () => {
  it.each([
    'Maya Vale',
    'Beyoncé & Tiësto',
    'W'.repeat(64),
    'WWWWWWWWWWWWW '.repeat(7).trim(),
    'A very long fictional profile name that needs the entire canvas to remain legible without losing its identity',
  ])('decodes a content-specific PNG for %s', async name => {
    const bytes = await render(name);
    const stats = await sharp(bytes).stats();
    expect(stats.isOpaque).toBe(true);
    expect(stats.channels[0].max).toBeGreaterThan(200);
    const { data } = await sharp(bytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const color = palette.swatches.canvas.dark.hex.slice(1);
    expect([...data.subarray(0, 3)]).toEqual(
      [0, 2, 4].map(i => Number.parseInt(color.slice(i, i + 2), 16))
    );
  });

  it('keeps the public handle in a stable footer across content lengths', async () => {
    const short = await render('Maya Vale');
    const long = await render(
      'A deliberately long fictional profile name that needs the whole canvas to preserve its meaning'
    );
    const footer = (bytes: Buffer) =>
      sharp(bytes)
        .extract({ left: 72, top: 520, width: 700, height: 44 })
        .raw()
        .toBuffer();
    expect(await footer(long)).toEqual(await footer(short));
    for (const name of ['W'.repeat(64), 'WWWWWWWWWWWWW '.repeat(7).trim()]) {
      expect(await footer(await render(name))).toEqual(await footer(short));
    }
  });

  it('preserves every edge of a landscape image with no overlays', async () => {
    const width = 320;
    const height = 160;
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 3;
        pixels[offset] = x < width / 2 ? 240 : 20;
        pixels[offset + 1] = y < height / 2 ? 40 : 220;
        pixels[offset + 2] = 100;
      }
    }
    const fixture = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    const bytes = await render('Maya Vale', {
      dataUrl: `data:image/png;base64,${fixture.toString('base64')}`,
      width,
      height,
    });
    const { data, info } = await sharp(bytes)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < info.width * info.height * 3; i += 3) {
      if (
        data[i + 2] === 100 &&
        (data[i] === 240 || data[i] === 20) &&
        (data[i + 1] === 40 || data[i + 1] === 220)
      ) {
        counts[(data[i] === 20 ? 1 : 0) + (data[i + 1] === 220 ? 2 : 0)]++;
      }
    }
    expect(counts).toEqual([12800, 12800, 12800, 12800]);
  });
});
