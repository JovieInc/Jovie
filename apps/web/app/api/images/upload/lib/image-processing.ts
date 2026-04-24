/**
 * Image Processing Utilities
 *
 * Handles image optimization using Sharp.
 */

import type { OutputInfo } from 'sharp';
import { HEIC_MIME_TYPES } from '@/lib/images/config';
import { withTimeout as withSharedTimeout } from '@/lib/resilience/primitives';
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

export async function canProcessMimeTypeWithSharp(
  mimeType: string
): Promise<boolean> {
  if (!HEIC_MIME_TYPES.has(mimeType.toLowerCase())) {
    return true;
  }

  const sharp = await getSharp();

  interface SharpWithFormat {
    format?: {
      heif?: {
        input?: { buffer?: boolean };
      };
    };
  }

  const sharpWithFormat = sharp as unknown as SharpWithFormat;

  const heifBufferSupport = sharpWithFormat.format?.heif?.input?.buffer;

  // If runtime metadata is unavailable, don't block valid uploads.
  return heifBufferSupport ?? true;
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
    .avif({ quality: AVATAR_AVIF_QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    avatar,
    width: avatar.info.width ?? metadata.width ?? null,
    height: avatar.info.height ?? metadata.height ?? null,
  };
}

/** Avatar download size presets (square, no upscaling) */
const AVATAR_DOWNLOAD_SIZES = [1024, 512, 256, 128] as const;
const AVATAR_MAX_DIMENSION = 1536;
const AVATAR_AVIF_QUALITY = 80;
const PRESS_DOWNLOAD_SIZES = [1200, 800, 400] as const;
const PRESS_MAX_DIMENSION = 2048;
const PRESS_AVIF_QUALITY = 75;

async function processPressPhotoSizesFromBuffer(
  inputBuffer: Buffer
): Promise<Record<string, Buffer>> {
  const sharp = await getSharp();
  const baseImage = sharp(inputBuffer, { failOnError: false })
    .rotate()
    .withMetadata({ orientation: undefined });

  const metadata = await baseImage.metadata();
  const originalWidth = metadata.width ?? PRESS_MAX_DIMENSION;
  const originalHeight = metadata.height ?? PRESS_MAX_DIMENSION;
  const results: Record<string, Buffer> = {};

  const maxDim = Math.max(originalWidth, originalHeight);
  const originalResize =
    maxDim > PRESS_MAX_DIMENSION ? PRESS_MAX_DIMENSION : undefined;

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
    .avif({ quality: PRESS_AVIF_QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  results.original = originalData;

  const pressSizeEntries = await Promise.all(
    PRESS_DOWNLOAD_SIZES.map(async size => {
      if (originalWidth < size && originalHeight < size) {
        return null;
      }

      const { data } = await baseImage
        .clone()
        .resize({
          width: size,
          height: size,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toColourspace('srgb')
        .avif({ quality: PRESS_AVIF_QUALITY, effort: 4 })
        .toBuffer({ resolveWithObject: true });

      return [String(size), data] as const;
    })
  );

  for (const entry of pressSizeEntries) {
    if (entry) {
      results[entry[0]] = entry[1];
    }
  }

  return results;
}

async function processAvatarSizesFromBuffer(
  inputBuffer: Buffer
): Promise<Record<string, Buffer>> {
  const sharp = await getSharp();
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
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: true,
    });
  }
  const { data: originalData } = await originalPipeline
    .toColourspace('srgb')
    .avif({ quality: AVATAR_AVIF_QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  results.original = originalData;

  // Generate each download size in parallel (square crop, no upscaling)
  const avatarSizeEntries = await Promise.all(
    AVATAR_DOWNLOAD_SIZES.map(async size => {
      if (originalWidth < size && originalHeight < size) {
        return null;
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

      return [String(size), data] as const;
    })
  );

  for (const entry of avatarSizeEntries) {
    if (entry) {
      results[entry[0]] = entry[1];
    }
  }

  return results;
}

/**
 * Process an avatar image into multiple download sizes, mirroring
 * the album-art multi-size pipeline used by processArtworkToSizes.
 *
 * Returns a map of `{ original, '512', '256', '128' }` → Buffer.
 */
export async function processAvatarToSizes(
  file: File
): Promise<Record<string, Buffer>> {
  const inputBuffer = await fileToBuffer(file);
  return processAvatarSizesFromBuffer(inputBuffer);
}

export async function processPressPhotoToSizes(
  file: File
): Promise<Record<string, Buffer>> {
  const inputBuffer = await fileToBuffer(file);
  return processPressPhotoSizesFromBuffer(inputBuffer);
}

/**
 * Process a press photo from a Buffer (for DSP image ingestion).
 * Same as processPressPhotoToSizes but accepts a Buffer instead of a File.
 */
export async function processPressPhotoBufferToSizes(
  inputBuffer: Buffer
): Promise<Record<string, Buffer>> {
  return processPressPhotoSizesFromBuffer(inputBuffer);
}

export async function getImageBufferMetadata(buffer: Buffer): Promise<{
  width: number | null;
  height: number | null;
}> {
  const sharp = await getSharp();
  const metadata = await sharp(buffer, { failOnError: false }).metadata();

  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  return withSharedTimeout(promise, {
    timeoutMs,
    context: operation,
  });
}
