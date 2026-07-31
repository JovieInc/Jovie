export const LIBRARY_PROFILE_VISIBILITIES = ['visible', 'hidden'] as const;
export const LIBRARY_PROFILE_ITEM_KINDS = [
  'release',
  'merch',
  'image',
  'video',
  'audio',
] as const;

export type LibraryProfileVisibility =
  (typeof LIBRARY_PROFILE_VISIBILITIES)[number];
export type LibraryProfileItemKind =
  (typeof LIBRARY_PROFILE_ITEM_KINDS)[number];

export const DEFAULT_LIBRARY_PROFILE_VISIBILITY: LibraryProfileVisibility =
  'visible';

export function isLibraryProfileVisibility(
  value: string | null | undefined
): value is LibraryProfileVisibility {
  return LIBRARY_PROFILE_VISIBILITIES.some(visibility => visibility === value);
}

export function isLibraryAssetVisibleOnProfile(
  visibility: LibraryProfileVisibility | null | undefined
): boolean {
  return visibility !== 'hidden';
}
