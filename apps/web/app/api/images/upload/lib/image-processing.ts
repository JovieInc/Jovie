/**
 * Image Processing Utilities
 *
 * Handles image optimization using Sharp.
 */

import type { OutputInfo } from 'sharp';
import { AVATAR_CANONICAL_SIZE } from './constants';
import type { SharpConstructor } from './types';

export async function getSharp(): Promise<SharpConstructor> {
  const sharpModule = await import('sharp');
  // Handle both ESM default export and CJS module.exports patterns
  const moduleWithDefault = sharpModule as { default?: SharpConstructor };
  if (moduleWithDefault.default) {
    return moduleWithDefault.default;
  }
  return sharpModule as unknown as SharpConstructor;
}

export async function fileToBuffer(file: File): Promise<Buffer> {
  const arrayBuffer =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Response(file).arrayBuffer();

  return Buffer.from(arrayBuffer);
}

export async function optimizeImageToAvif(file: File): Promise<{
  avatar: { data: Buffer; info: OutputInfo };
  width: number | null;
  height: number | null;
}> {
  const sharp = await getSharp();
  const inputBuffer = await fileToBuffer(file);

  const baseImage = sharp(inputBuffer, {
    failOnError: false,
  })
    .rotate()
    .withMetadata({ orientation: undefined });

  const metadata = await baseImage.metadata();

  const avatar = await baseImage
    .clone()
    .resize({
      width: AVATAR_CANONICAL_SIZE,
      height: AVATAR_CANONICAL_SIZE,
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: true,
    })
    .toColourspace('srgb')
    .avif({ quality: 65, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    avatar,
    width: avatar.info.width ?? metadata.width ?? null,
    height: avatar.info.height ?? metadata.height ?? null,
  };
}

/** Avatar download size presets (square, no upscaling) */
const AVATAR_DOWNLOAD_SIZES = [512, 256, 128] as const;
const AVATAR_MAX_DIMENSION = 1536;
const AVATAR_AVIF_QUALITY = 70;

/**
 * Process an avatar image into multiple download sizes, mirroring
 * the album-art multi-size pipeline used by processArtworkToSizes.
 *
 * Returns a map of `{ original, '512', '256', '128' }` → Buffer.
 */
export async function processAvatarToSizes(
  file: File
): Promise<Record<string, Buffer>> {
  const sharp = await getSharp();
  const inputBuffer = await fileToBuffer(file);
  const baseImage = sharp(inputBuffer, { failOnError: false })
    .rotate()
    .withMetadata({ orientation: undefined });

  const metadata = await baseImage.metadata();
  const originalWidth = metadata.width ?? AVATAR_MAX_DIMENSION;
  const originalHeight = metadata.height ?? AVATAR_MAX_DIMENSION;

  const results: Record<string, Buffer> = {};

  // Original: capped at 1536px, no upscaling
  const maxDim = Math.max(originalWidth, originalHeight);
  const originalResize =
    maxDim > AVATAR_MAX_DIMENSION ? AVATAR_MAX_DIMENSION : undefined;

  let originalPipeline = baseImage.clone();
  if (originalResize) {
    originalPipeline = originalPipeline.resize({
      width: originalResize,
      height: originalResize,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  const { data: originalData } = await originalPipeline
    .toColourspace('srgb')
    .avif({ quality: AVATAR_AVIF_QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  results.original = originalData;

  // Generate each download size (square crop, no upscaling)
  for (const size of AVATAR_DOWNLOAD_SIZES) {
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
      .avif({ quality: AVATAR_AVIF_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    results[String(size)] = data;
  }

  return results;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
