import { publicEnv } from '@/lib/env-public';

export type CloudinaryCrop =
  | 'fill'
  | 'fit'
  | 'thumb'
  | 'scale'
  | 'crop'
  | 'pad';
export type CloudinaryGravity =
  | 'auto'
  | 'face'
  | 'faces'
  | 'center'
  | 'north'
  | 'south'
  | 'east'
  | 'west';

export interface CloudinaryOptions {
  width?: number;
  height?: number;
  quality?: 'auto' | number; // e.g. 'auto' or 60
  format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png';
  crop?: CloudinaryCrop;
  gravity?: CloudinaryGravity;
  radius?: number | 'max'; // for rounded/avatars
  dpr?: 'auto' | number;
  fetchFormat?: 'auto' | 'webp' | 'avif';
}

// Build a Cloudinary delivery URL for an image public_id.
// Always prefer auto format/quality for performance.
export function cloudinaryUrl(
  publicId: string,
  opts: CloudinaryOptions = {}
): string {
  const cloud = publicEnv.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloud) {
    // Fallback: if Cloudinary is not configured, return the publicId as-is.
    return publicId;
  }

  const parts: string[] = [];

  // Defaults geared for performance
  const format = opts.format ?? 'auto';
  const quality = opts.quality ?? 'auto';
  const dpr = opts.dpr ?? 'auto';

  parts.push(`f_${format}`, `q_${quality}`, `dpr_${dpr}`);

  if (opts.width) parts.push(`w_${opts.width}`);
  if (opts.height) parts.push(`h_${opts.height}`);
  if (opts.crop) parts.push(`c_${opts.crop}`);
  if (opts.gravity) parts.push(`g_${opts.gravity}`);
  if (opts.radius !== undefined) parts.push(`r_${opts.radius}`);

  const transformation = parts.join(',');

  // Note: publicId may include folder path (e.g., `avatars/abc123`)
  return `https://res.cloudinary.com/${cloud}/image/upload/${transformation}/${encodeURIComponent(publicId)}`;
}

export function cloudinaryAvatarUrl(
  publicId: string,
  size: number = 256
): string {
  return cloudinaryUrl(publicId, {
    width: size,
    height: size,
    crop: 'thumb',
    gravity: 'face',
    radius: 'max',
    format: 'auto',
    quality: 'auto',
    dpr: 'auto',
  });
}
