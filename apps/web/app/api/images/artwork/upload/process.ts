/**
 * Artwork Image Processing
 *
 * Processes uploaded artwork into multiple sizes for download options.
 */

import type { SharpConstructor } from '../../upload/lib/types';

const ARTWORK_MAX_DIMENSION = 3000;
const ARTWORK_DOWNLOAD_SIZES = [1000, 500, 250] as const;
const AVIF_QUALITY = 80; // Higher quality than avatars for artwork
const AVIF_EFFORT = 4;

async function getSharp(): Promise<SharpConstructor> {
  const sharpModule = await import('sharp');
  const moduleWithDefault = sharpModule as { default?: SharpConstructor };
  if (moduleWithDefault.default) {
    return moduleWithDefault.default;
  }
  return sharpModule as unknown as SharpConstructor;
}

export async function processArtworkToSizes(
  file: File
): Promise<Record<string, Buffer>> {
  const sharp = await getSharp();
  const arrayBuffer =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Response(file).arrayBuffer();

  const inputBuffer = Buffer.from(arrayBuffer);
  const baseImage = sharp(inputBuffer, { failOnError: false })
    .rotate()
    .withMetadata({ orientation: undefined });

  const metadata = await baseImage.metadata();
  const originalWidth = metadata.width ?? ARTWORK_MAX_DIMENSION;
  const originalHeight = metadata.height ?? ARTWORK_MAX_DIMENSION;

  const results: Record<string, Buffer> = {};

  // Original size (capped at 3000px, no upscaling)
  const maxDim = Math.max(originalWidth, originalHeight);
  const originalResize =
    maxDim > ARTWORK_MAX_DIMENSION ? ARTWORK_MAX_DIMENSION : undefined;

  const { data: originalData } = await baseImage
    .clone()
    .resize(
      originalResize
        ? {
            width: originalResize,
            height: originalResize,
            fit: 'inside',
            withoutEnlargement: true,
          }
        : undefined
    )
    .toColourspace('srgb')
    .avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT })
    .toBuffer({ resolveWithObject: true });

  results.original = originalData;

  // Generate each download size (square crop, no upscaling)
  for (const size of ARTWORK_DOWNLOAD_SIZES) {
    // Skip if original is smaller than this size
    if (originalWidth < size && originalHeight < size) {
      continue;
    }

    const { data } = await baseImage
      .clone()
      .resize({
        width: size,
        height: size,
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: true,
      })
      .toColourspace('srgb')
      .avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT })
      .toBuffer({ resolveWithObject: true });

    results[String(size)] = data;
  }

  return results;
}
