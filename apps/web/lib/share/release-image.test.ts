import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadImage } from '@/lib/ingestion/avatar/http-client';
import { loadReleaseShareArtwork } from './release-image';

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
});

const credentialUrl = new URL('https://i.scdn.co/a');
credentialUrl.username = 'fixture-user';
credentialUrl.password = 'fixture-password';

describe('release share artwork', () => {
  it.each([
    'http://i.scdn.co/image/a',
    'https://jov.ie:444/a',
    credentialUrl.toString(),
  ])('rejects unsupported destinations before downloading: %s', async url => {
    expect(await loadReleaseShareArtwork(url)).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it.each(['png', 'jpeg', 'avif', 'webp'] as const)(
    'actually decodes and normalizes %s',
    async format => {
      downloaded(await source(640, 320, format));
      const artwork = await loadReleaseShareArtwork(
        'https://i.scdn.co/image/a'
      );
      expect(artwork).not.toBeNull();
      const { width, height } = await sharp(
        Buffer.from(artwork!.dataUrl.split(',')[1] ?? '', 'base64')
      ).metadata();
      // Square-normalized sleeves fit the 360px card box without growing
      // and keep the landscape source's aspect ratio.
      expect(width).toBeLessThanOrEqual(360);
      expect(height).toBeLessThanOrEqual(360);
      expect(height! * 2).toBe(width);
    }
  );

  it('returns null instead of throwing when the download fails', async () => {
    download.mockRejectedValue(new Error('upstream unavailable'));
    expect(
      await loadReleaseShareArtwork('https://i.scdn.co/image/a')
    ).toBeNull();
  });
});
