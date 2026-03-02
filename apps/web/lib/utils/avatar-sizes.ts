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
 * Generate S/M/L size variants from a single source URL.
 * Uses Cloudinary URL transforms when the image is hosted on Cloudinary.
 * Returns only the original if transforms cannot be applied.
 */
function generateSizeVariants(sourceUrl: string): AvatarSize[] {
  const sizes: AvatarSize[] = [];

  for (const preset of SIZE_PRESETS) {
    const resizedUrl = buildCloudinaryResizedUrl(
      sourceUrl,
      preset.dimension,
      preset.dimension
    );
    if (resizedUrl) {
      sizes.push({
        key: preset.key,
        label: preset.label,
        url: resizedUrl,
      });
    }
  }

  return sizes;
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
    // Add S/M/L variants derived from the original URL
    if (originalUrl) {
      sizes.push(...generateSizeVariants(originalUrl));
    }

    // Add pre-computed sizes from the map that weren't covered above
    if (sizesMap['512']) {
      sizes.push({ key: '512', label: '512 x 512', url: sizesMap['512'] });
    }
    if (sizesMap['256']) {
      sizes.push({ key: '256', label: '256 x 256', url: sizesMap['256'] });
    }
    if (sizesMap['128']) {
      sizes.push({ key: '128', label: '128 x 128', url: sizesMap['128'] });
    }

    // Always include original at the end
    if (sizesMap.original) {
      sizes.push({
        key: 'original',
        label: 'Original',
        url: sizesMap.original,
      });
    }
  } else if (avatarUrl) {
    // No pre-computed sizes map — generate S/M/L from the avatar URL
    sizes.push(...generateSizeVariants(avatarUrl));
    sizes.push({ key: 'original', label: 'Original', url: avatarUrl });
  }

  return sizes;
}
