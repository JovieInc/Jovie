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
