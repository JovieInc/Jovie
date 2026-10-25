import { downloadImage } from '@/lib/ingestion/avatar/http-client';
import { withTimeout } from '@/lib/resilience/primitives';
import type { ReleaseShareArtwork } from './release-card';

/**
 * Download and normalize release artwork for the smart link share card
 * (JOV-7864). Artwork originates from ingested label/DSP media, so unlike
 * avatars there is no fixed host allowlist; `downloadImage` still enforces
 * https-only, private-address, redirect, MIME and magic-byte protections,
 * and sharp decodes/transcodes so ImageResponse always receives a PNG.
 * The sleeve keeps its aspect ratio (fit inside, never enlarged) so the card
 * contains the artwork without cropping it.
 */
export async function loadReleaseShareArtwork(
  artworkUrl: string
): Promise<ReleaseShareArtwork | null> {
  try {
    const url = new URL(artworkUrl);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    ) {
      return null;
    }
    const { buffer } = await withTimeout(downloadImage(url.toString()), {
      timeoutMs: 3000,
      context: 'release share artwork download',
    });
    const { default: sharp } = await import('sharp');
    // Decode even JPEG/PNG inputs: a successful fetch is not a valid image.
    const { data, info } = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: 16_000_000,
    })
      .timeout({ seconds: 2 })
      .rotate()
      .resize({
        width: 360,
        height: 360,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toColourspace('srgb')
      .png()
      .toBuffer({ resolveWithObject: true });
    return {
      dataUrl: `data:image/png;base64,${data.toString('base64')}`,
      width: info.width,
      height: info.height,
    };
  } catch {
    return null;
  }
}
