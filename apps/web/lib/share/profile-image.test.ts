import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadImage } from '@/lib/ingestion/avatar/http-client';
import { loadProfileShareImage } from './profile-image';

vi.mock('@/lib/ingestion/avatar/http-client', () => ({
  downloadImage: vi.fn(),
}));
const download = vi.mocked(downloadImage);

async function source(
  width: number,
  height: number,
  format: 'png' | 'jpeg' | 'avif' | 'webp' = 'png'
) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 40, b: 80, alpha: 0.5 },
    },
  })
    .toFormat(format)
    .toBuffer();
}
function downloaded(buffer: Buffer) {
  download.mockResolvedValue({
    buffer,
    contentType: 'image/png',
    filename: 'synthetic-fixture',
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

const credentialUrl = new URL('https://i.scdn.co/a');
credentialUrl.username = 'fixture-user';
credentialUrl.password = 'fixture-password';

describe('profile preview imagery', () => {
  it.each([
    'http://i.scdn.co/image/a',
    'https://127.0.0.1/a',
    'https://attacker.test/a',
    credentialUrl.toString(),
    'https://i.scdn.co:444/a',
  ])('rejects unsupported destinations before downloading: %s', async url => {
    expect(await loadProfileShareImage(url)).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it.each(['png', 'jpeg', 'avif', 'webp'] as const)(
    'actually decodes and normalizes %s',
    async format => {
      downloaded(await source(640, 320, format));
      const image = await loadProfileShareImage('https://i.scdn.co/image/a');
      expect(image).toMatchObject({ width: 360, height: 180 });
      const bytes = Buffer.from(image!.dataUrl.split(',')[1], 'base64');
      expect(await sharp(bytes).metadata()).toMatchObject({
        format: 'png',
        width: 360,
        height: 180,
        space: 'srgb',
      });
    }
  );

  it.each([
    [24, 16, 24, 16],
    [240, 480, 180, 360],
    [480, 240, 360, 180],
  ])(
    'contains %ix%i imagery without enlarging or cropping',
    async (width, height, outWidth, outHeight) => {
      downloaded(await source(width, height));
      expect(
        await loadProfileShareImage('https://i.scdn.co/image/a')
      ).toMatchObject({ width: outWidth, height: outHeight });
    }
  );

  it('does not trust a PNG MIME type when the pixels are corrupt', async () => {
    downloaded(Buffer.from('not a PNG'));
    expect(
      await loadProfileShareImage('https://i.scdn.co/image/broken')
    ).toBeNull();
  });

  it('rejects images whose decoded size exceeds the budget', async () => {
    downloaded(await source(5000, 4000));
    expect(
      await loadProfileShareImage('https://i.scdn.co/image/huge')
    ).toBeNull();
  });

  it('falls back on download failure', async () => {
    download.mockRejectedValue(
      new Error('unsafe redirect or unavailable image')
    );
    expect(await loadProfileShareImage('https://i.scdn.co/image/a')).toBeNull();
  });

  it('bounds the wait for a slow image', async () => {
    vi.useFakeTimers();
    download.mockReturnValue(new Promise(() => {}));
    const result = loadProfileShareImage('https://i.scdn.co/image/a');
    await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toBeNull();
  });
});
