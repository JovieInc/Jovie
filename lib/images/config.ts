import { slugify } from '@/lib/utils';

export const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'image/tiff',
] as const;

export type SupportedImageMimeType =
  (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

export const AVATAR_MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB API limit

export const AVATAR_OPTIMIZED_SIZES = {
  small: 128,
  medium: 256,
  large: 512,
  original: 1024,
} as const;

export function formatAcceptedImageTypes(
  accepted: readonly string[] = SUPPORTED_IMAGE_MIME_TYPES
): string[] {
  const formatted = accepted.map(type => {
    const subtype = type.split('/')[1] ?? type;
    const cleaned = subtype.split(';')[0] ?? subtype;
    const base = cleaned.split('-')[0] || cleaned;
    const upper = base.toUpperCase();

    if (upper === 'JPG') return 'JPEG';
    if (upper.startsWith('HEIC') || upper.startsWith('HEIF')) {
      return 'HEIC/HEIF';
    }

    return upper;
  });

  return Array.from(new Set(formatted));
}

export function buildSeoFilename({
  originalFilename,
  photoId,
  userLabel,
}: {
  originalFilename: string;
  photoId: string;
  userLabel?: string | null;
}): string {
  const baseName =
    userLabel?.trim() ||
    originalFilename.replace(/\.[^.]+$/, '') ||
    'profile-photo';

  const slug = slugify(baseName) || 'profile-photo';
  return `${slug}-${photoId}`;
}
