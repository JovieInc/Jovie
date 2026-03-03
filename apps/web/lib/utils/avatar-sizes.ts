/**
 * Pure utility for building avatar size options from profile settings.
 *
 * Extracted from ProfilePhotoContextMenu so it can be safely called
 * from both server and client components.
 */

export interface AvatarSize {
  readonly key: string;
  readonly label: string;
  readonly url: string;
}

/** Standard download size presets: Small, Medium, Large */
const SIZE_PRESETS = [
  { key: 'small', label: 'Small (150 x 150)', dimension: 150 },
  { key: 'medium', label: 'Medium (400 x 400)', dimension: 400 },
  { key: 'large', label: 'Large (800 x 800)', dimension: 800 },
] as const;

/**
 * Insert a Cloudinary resize transformation into an existing Cloudinary URL.
 * Cloudinary URLs follow the pattern:
 *   https://res.cloudinary.com/{cloud}/image/upload/{transforms}/{publicId}
 * We append `w_{size},h_{size},c_fill` to the existing transformation chain.
 */
function buildCloudinaryResizedUrl(
  url: string,
  width: number,
  height: number
): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'res.cloudinary.com') return null;

    // Path: /{cloud}/image/upload/{transforms}/{publicId}
    const segments = parsed.pathname.split('/');
    const uploadIndex = segments.indexOf('upload');
    if (uploadIndex === -1) return null;

    // Insert size transform right after "upload"
    const sizeTransform = `w_${width},h_${height},c_fill`;
    segments.splice(uploadIndex + 1, 0, sizeTransform);
    parsed.pathname = segments.join('/');
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Build a resized image URL using Next.js Image Optimization API.
 * Works for any image URL that Next.js is configured to optimize
 * (e.g. Vercel Blob, configured remote patterns in next.config).
 */
function buildNextImageUrl(url: string, width: number): string {
  const params = new URLSearchParams({
    url,
    w: String(width),
    q: '90',
  });
  return `/_next/image?${params.toString()}`;
}

/**
 * Generate S/M/L size variants from a single source URL.
 * Uses Cloudinary URL transforms when the image is hosted on Cloudinary,
 * otherwise falls back to Next.js Image Optimization API.
 */
function generateSizeVariants(sourceUrl: string): AvatarSize[] {
  const sizes: AvatarSize[] = [];

  for (const preset of SIZE_PRESETS) {
    const cloudinaryUrl = buildCloudinaryResizedUrl(
      sourceUrl,
      preset.dimension,
      preset.dimension
    );
    const resizedUrl =
      cloudinaryUrl ?? buildNextImageUrl(sourceUrl, preset.dimension);
    sizes.push({
      key: preset.key,
      label: preset.label,
      url: resizedUrl,
    });
  }

  return sizes;
}

const PRECOMPUTED_SIZE_KEYS: { key: string; sizeKey: string; label: string }[] =
  [
    { key: 'large', sizeKey: '512', label: 'Large (512 x 512)' },
    { key: 'medium', sizeKey: '256', label: 'Medium (256 x 256)' },
    { key: 'small', sizeKey: '128', label: 'Small (128 x 128)' },
  ];

function collectPrecomputedSizes(
  sizesMap: Record<string, string>
): AvatarSize[] {
  return PRECOMPUTED_SIZE_KEYS.filter(({ sizeKey }) => sizesMap[sizeKey]).map(
    ({ key, sizeKey, label }) => ({ key, label, url: sizesMap[sizeKey] })
  );
}

/** Build avatar sizes from a URL map stored in profile settings */
export function buildAvatarSizes(
  sizesMap: Record<string, string> | null | undefined,
  avatarUrl: string | null | undefined
): AvatarSize[] {
  if (!sizesMap && !avatarUrl) return [];

  const sizes: AvatarSize[] = [];
  const originalUrl = sizesMap?.original ?? avatarUrl ?? undefined;

  if (sizesMap && Object.keys(sizesMap).length > 0) {
    const precomputed = collectPrecomputedSizes(sizesMap);

    if (precomputed.length > 0) {
      sizes.push(...precomputed);
    } else if (originalUrl) {
      sizes.push(...generateSizeVariants(originalUrl));
    }

    if (sizesMap.original) {
      sizes.push({
        key: 'original',
        label: 'Original',
        url: sizesMap.original,
      });
    }
  } else if (avatarUrl) {
    sizes.push(...generateSizeVariants(avatarUrl), {
      key: 'original',
      label: 'Original',
      url: avatarUrl,
    });
  }

  return sizes;
}
