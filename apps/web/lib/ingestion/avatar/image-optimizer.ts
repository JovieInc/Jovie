/**
 * Image Optimizer
 *
 * Utilities for optimizing images to avatar format.
 */

import { withTimeout as withSharedTimeout } from '@/lib/resilience/primitives';
import type { OptimizedAvatar, SharpConstructor, SharpModule } from './types';

function isSharpConstructor(value: unknown): value is SharpConstructor {
  return typeof value === 'function';
}

function hasDefaultExport(
  value: unknown
): value is SharpModule & { default: unknown } {
  return typeof value === 'object' && value !== null && 'default' in value;
}

/**
 * Dynamically import sharp module.
 */
export async function getSharp(): Promise<SharpConstructor> {
  const importedModule: unknown = await import('sharp');

  if (hasDefaultExport(importedModule)) {
    if (isSharpConstructor(importedModule.default)) {
      return importedModule.default;
    }
  }

  if (isSharpConstructor(importedModule)) {
    return importedModule;
  }

  throw new Error('Invalid sharp module shape');
}

/**
 * Add timeout to a promise.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return withSharedTimeout(promise, {
    timeoutMs,
    context: 'avatar image processing',
    timeoutMessage: 'timeout',
  });
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
