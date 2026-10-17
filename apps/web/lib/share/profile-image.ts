import { isAllowedAvatarHostname } from '@/lib/images/avatar-hosts';
import { downloadImage } from '@/lib/ingestion/avatar/http-client';
import { withTimeout } from '@/lib/resilience/primitives';
import type { ProfileShareImage } from './profile-card';

/** Reuse ingest's MIME, magic-byte, redirect and private-address protections. */
export async function loadProfileShareImage(
  imageUrl: string
): Promise<ProfileShareImage | null> {
  try {
    const url = new URL(imageUrl);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      !isAllowedAvatarHostname(url.hostname)
    ) {
      return null;
    }
    const { buffer } = await withTimeout(downloadImage(url.toString()), {
      timeoutMs: 3000,
      context: 'profile share image download',
    });
    const { default: sharp } = await import('sharp');
    // Decode even JPEG/PNG inputs: a successful fetch is not a valid image.
    // Keep orientation and aspect ratio; low-resolution sources stay small.
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
