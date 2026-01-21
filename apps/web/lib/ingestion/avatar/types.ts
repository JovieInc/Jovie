/**
 * Avatar Types
 *
 * Type definitions for avatar processing.
 */

import type { OutputInfo } from 'sharp';
import type { SupportedImageMimeType } from '@/lib/images/config';

export type SharpModule = typeof import('sharp');
export type SharpConstructor = SharpModule extends { default: infer D }
  ? D
  : SharpModule;

export type AvatarCandidate = {
  avatarUrl: string;
  sourcePlatform: string;
};

export type DownloadedImage = {
  buffer: Buffer;
  contentType: SupportedImageMimeType;
  filename: string;
};

export type OptimizedAvatar = {
  data: Buffer;
  info: OutputInfo;
  width: number | null;
  height: number | null;
};
