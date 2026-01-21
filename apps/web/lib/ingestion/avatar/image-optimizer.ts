/**
 * Image Optimizer
 *
 * Utilities for optimizing images to avatar format.
 */

import type { OptimizedAvatar, SharpConstructor, SharpModule } from './types';

/**
 * Dynamically import sharp module.
 */
export async function getSharp(): Promise<SharpConstructor> {
  const sharpModule = (await import('sharp')) as unknown as SharpModule;
  const factory = (sharpModule as SharpModule & { default?: unknown }).default;
  if (factory) {
    return factory as SharpConstructor;
  }
  return sharpModule as unknown as SharpConstructor;
}

/**
 * Add timeout to a promise.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Optimize an image buffer to avatar AVIF format.
 */
export async function optimizeToAvatarAvif(
  inputBuffer: Buffer
): Promise<OptimizedAvatar> {
  const sharp = await getSharp();
  const baseImage = sharp(inputBuffer, { failOnError: false })
    .rotate()
    .withMetadata({ orientation: undefined });

  const metadata = await baseImage.metadata();

  const avatar = await baseImage
    .clone()
    .resize({
      width: 512,
      height: 512,
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: true,
    })
    .toColourspace('srgb')
    .avif({ quality: 65, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    data: avatar.data,
    info: avatar.info,
    width: avatar.info.width ?? metadata.width ?? null,
    height: avatar.info.height ?? metadata.height ?? null,
  };
}
