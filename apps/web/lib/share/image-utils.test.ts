import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toDataUrl } from './image-utils';

async function solidImage(format: 'png' | 'avif' | 'webp'): Promise<Buffer> {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .toFormat(format)
    .toBuffer();
}

function stubFetch(body: Uint8Array, contentType: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { 'content-type': contentType },
        })
    )
  );
}

async function decodedFormat(dataUrl: string): Promise<string | undefined> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const metadata = await sharp(Buffer.from(base64, 'base64')).metadata();
  return metadata.format;
}

describe('toDataUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes PNG through unchanged', async () => {
    const png = await solidImage('png');
    stubFetch(new Uint8Array(png), 'image/png');

    const dataUrl = await toDataUrl('https://cdn.example.com/a.png');

    expect(dataUrl).toBe(`data:image/png;base64,${png.toString('base64')}`);
  });

  // JOV-7753: ingested avatars are AVIF; Satori cannot decode them, which
  // made every such profile's OG card (the outreach link preview) 500.
  it('transcodes AVIF avatars to PNG so next/og can render them', async () => {
    stubFetch(new Uint8Array(await solidImage('avif')), 'image/avif');

    const dataUrl = await toDataUrl('https://cdn.example.com/a.avif');

    expect(dataUrl?.startsWith('data:image/png;base64,')).toBe(true);
    expect(await decodedFormat(dataUrl ?? '')).toBe('png');
  });

  it('transcodes WebP to PNG', async () => {
    stubFetch(new Uint8Array(await solidImage('webp')), 'image/webp');

    const dataUrl = await toDataUrl('https://cdn.example.com/a.webp');

    expect(await decodedFormat(dataUrl ?? '')).toBe('png');
  });

  it('returns null for bytes that cannot be decoded', async () => {
    stubFetch(new Uint8Array([1, 2, 3, 4]), 'image/avif');

    await expect(
      toDataUrl('https://cdn.example.com/broken.avif')
    ).resolves.toBeNull();
  });
});
