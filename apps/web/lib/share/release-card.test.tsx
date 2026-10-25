// @vitest-environment node
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import palette from '@/design/oklch-palette.json';
import { loadSatoshiFont, OG_SIZE } from './image-utils';
import {
  type ReleaseShareArtwork,
  renderReleaseShareCard,
} from './release-card';

async function render(
  params: Parameters<typeof renderReleaseShareCard>[0],
  artwork?: ReleaseShareArtwork
) {
  const response = new ImageResponse(
    renderReleaseShareCard({ ...params, artwork: artwork ?? null }),
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

const BASE_PARAMS = {
  artist: 'Maya Vale',
  typeLabel: 'album',
  year: 2026,
  handle: 'maya-vale',
  slug: 'neon-tide',
} as const;

describe('release share card pixels (JOV-7864)', () => {
  it('decodes a content-specific 1200x630 PNG', async () => {
    const a = await render({ ...BASE_PARAMS, title: 'Neon Tide' });
    const b = await render({ ...BASE_PARAMS, title: 'Static Bloom' });
    expect(a.equals(b)).toBe(false);

    const stats = await sharp(a).stats();
    expect(stats.isOpaque).toBe(true);
    const { data } = await sharp(a).raw().toBuffer({ resolveWithObject: true });
    const color = palette.swatches.canvas.dark.hex.slice(1);
    expect([...data.subarray(0, 3)]).toEqual(
      [0, 2, 4].map(i => Number.parseInt(color.slice(i, i + 2), 16))
    );
  });

  it('contains the whole sleeve with nothing drawn over it', async () => {
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
    const fixture = await sharp(pixels, {
      raw: { width, height, channels: 3 },
    })
      .png()
      .toBuffer();
    const bytes = await render(
      { ...BASE_PARAMS, title: 'Neon Tide' },
      {
        dataUrl: `data:image/png;base64,${fixture.toString('base64')}`,
        width,
        height,
      }
    );
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
    // Every fixture pixel survives unobstructed: no cropping (contain), and no
    // text, glyph or play affordance is rendered over the sleeve.
    expect(counts).toEqual([12800, 12800, 12800, 12800]);
  });

  it('keeps the footer stable across title lengths', async () => {
    const footer = (bytes: Buffer) =>
      sharp(bytes)
        .extract({ left: 72, top: 520, width: 700, height: 44 })
        .raw()
        .toBuffer();
    const short = await render({ ...BASE_PARAMS, title: 'Neon Tide' });
    for (const title of [
      'W'.repeat(64),
      'A deliberately long release title that needs the whole canvas to stay legible and still clamps quietly',
    ]) {
      expect(await footer(await render({ ...BASE_PARAMS, title }))).toEqual(
        await footer(short)
      );
    }
  });
});
