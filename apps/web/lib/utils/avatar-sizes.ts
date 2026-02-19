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

/** Build avatar sizes from a URL map stored in profile settings */
export function buildAvatarSizes(
  sizesMap: Record<string, string> | null | undefined,
  avatarUrl: string | null | undefined
): AvatarSize[] {
  if (!sizesMap && !avatarUrl) return [];

  const sizes: AvatarSize[] = [];

  if (sizesMap && Object.keys(sizesMap).length > 0) {
    if (sizesMap.original) {
      sizes.push({
        key: 'original',
        label: 'Original',
        url: sizesMap.original,
      });
    }
    if (sizesMap['512']) {
      sizes.push({ key: '512', label: '512 × 512', url: sizesMap['512'] });
    }
    if (sizesMap['256']) {
      sizes.push({ key: '256', label: '256 × 256', url: sizesMap['256'] });
    }
    if (sizesMap['128']) {
      sizes.push({ key: '128', label: '128 × 128', url: sizesMap['128'] });
    }
  } else if (avatarUrl) {
    sizes.push({ key: 'original', label: 'Original', url: avatarUrl });
  }

  return sizes;
}
