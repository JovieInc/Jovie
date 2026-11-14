/**
 * Pure helpers for Apple Music catalog completeness (JOV-7140).
 * Kept free of server-only imports so they are unit-testable.
 */

export interface AppleCatalogAlbum {
  id: string;
  attributes: {
    name: string;
    artistName: string;
    upc?: string;
    releaseDate?: string;
    trackCount: number;
    url: string;
    isSingle?: boolean;
    isCompilation?: boolean;
    recordLabel?: string;
    contentRating?: string;
    artwork?: { url: string; width: number; height: number };
  };
}

export interface ExistingLibraryRelease {
  title: string;
  upc: string | null;
  /** Apple album IDs already linked to this release, if any. */
  appleAlbumIds: readonly string[];
}

export type AppleReleaseType = 'single' | 'ep' | 'album' | 'compilation';

const SUFFIX = /\s+-\s+(single|ep)$/i;

/** Title as an artist would write it: Apple's " - EP" / " - Single" dropped. */
export function cleanAppleAlbumTitle(name: string): string {
  return name.replace(SUFFIX, '').trim();
}

export function appleReleaseType(album: AppleCatalogAlbum): AppleReleaseType {
  const { name, isSingle, isCompilation } = album.attributes;
  if (isCompilation) return 'compilation';
  const suffix = SUFFIX.exec(name)?.[1]?.toLowerCase();
  if (isSingle || suffix === 'single') return 'single';
  if (suffix === 'ep') return 'ep';
  return album.attributes.trackCount <= 1 ? 'single' : 'album';
}

/** Compare titles loosely: case, punctuation, Apple suffixes and "with X". */
export function titleKey(title: string): string {
  return cleanAppleAlbumTitle(title)
    .toLowerCase()
    .replace(/\s*[([](?:feat\.?|ft\.?|with)\s[^)\]]*[)\]]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export const upcKey = (upc: string | null | undefined): string | null => {
  const digits = upc?.replace(/\D/g, '').replace(/^0+/, '');
  return digits ? digits : null;
};

/** Album ID from an Apple Music album URL (…/album/{name}/{id}). */
export function appleAlbumIdFromUrl(
  url: string | null | undefined
): string | null {
  const match = url
    ? /music\.apple\.com\/.+\/album\/(?:[^/]+\/)?(\d+)/.exec(url)
    : null;
  return match?.[1] ?? null;
}

/**
 * Apple albums by this artist that the Library does not hold yet.
 * Conservative on purpose: a title already in the Library counts as present
 * (another edition or version is a choice for the artist, not an import).
 * Various Artists compilations are skipped.
 */
export function selectMissingAppleAlbums(
  albums: readonly AppleCatalogAlbum[],
  library: readonly ExistingLibraryRelease[]
): AppleCatalogAlbum[] {
  const upcs = new Set(library.map(r => upcKey(r.upc)).filter(Boolean));
  const titles = new Set(library.map(r => titleKey(r.title)));
  const appleIds = new Set(library.flatMap(r => r.appleAlbumIds));
  const seen = new Set<string>();
  const missing: AppleCatalogAlbum[] = [];

  for (const album of albums) {
    const { name, artistName, upc } = album.attributes;
    if (/^various artists$/i.test(artistName.trim())) continue;
    const key = titleKey(name);
    if (!key) continue;
    if (appleIds.has(album.id)) continue;
    const albumUpc = upcKey(upc);
    if (albumUpc && upcs.has(albumUpc)) continue;
    if (titles.has(key) || seen.has(key)) continue;
    seen.add(key);
    missing.push(album);
  }
  return missing;
}

/** Apple artwork template → a fixed-size URL. */
export function appleArtworkUrl(
  artwork: AppleCatalogAlbum['attributes']['artwork'],
  size = 1000
): string | null {
  if (!artwork?.url) return null;
  return artwork.url.replace('{w}', String(size)).replace('{h}', String(size));
}
