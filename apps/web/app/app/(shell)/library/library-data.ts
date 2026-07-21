import type { ReleaseViewModel } from '@/lib/discography/types';
import {
  DEFAULT_LIBRARY_APPROVAL_STATUS,
  type LibraryApprovalStatus,
} from '@/lib/library/approval-status';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import type { LibraryMerchCard } from '@/lib/merch/types';
import { hashLibraryWaveformSeed } from './library-waveform-peaks';

export interface LibraryProviderLink {
  readonly key: string;
  readonly label: string;
  readonly url: string;
}

export type LibraryAssetKind =
  | 'artwork'
  | 'preview'
  | 'lyrics'
  | 'providers'
  | 'video';

export type LibraryItemKind = 'release' | 'merch' | 'image' | 'video' | 'audio';

export type LibraryView =
  | 'all'
  | 'releases'
  | 'merch'
  | 'images'
  | 'videos'
  | 'audio';

export type LibraryAspectRatio = '1:1' | '16:9' | '9:16';

export type LibraryGridDensity = 'compact' | 'comfortable' | 'spacious';

export type LibraryViewMode = 'grid' | 'list' | 'table';

export type LibraryMediaOrientation = 'landscape' | 'portrait';

export interface LibraryReleaseAsset {
  readonly itemKind?: LibraryItemKind;
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly artworkUrl: string | null;
  readonly previewUrl: string | null;
  readonly videoUrl: string | null;
  readonly waveformSeed: number;
  readonly smartLinkPath: string;
  readonly releaseDate: string | null;
  readonly releaseType: ReleaseViewModel['releaseType'];
  readonly status: ReleaseViewModel['status'];
  readonly approvalStatus: LibraryApprovalStatus;
  readonly trackCount: number;
  readonly providerCount: number;
  readonly providers: readonly LibraryProviderLink[];
  readonly hasLyrics: boolean;
  readonly hasArtwork: boolean;
  readonly hasVideoLinks: boolean;
  readonly assetKinds: readonly LibraryAssetKind[];
  readonly genres: readonly string[];
  readonly spotifyPopularity: number | null;
  readonly targetPlaylistCount: number;
  readonly isExplicit: boolean;
  readonly label: string | null;
  readonly upc: string | null;
  readonly distributor: string | null;
  readonly totalDurationMs: number | null;
  readonly itemStatusLabel?: string;
  readonly primaryActionLabel?: string;
  readonly primaryActionHref?: string | null;
  readonly productType?: string;
  readonly salePriceLabel?: string;
  readonly profitLabel?: string;
  readonly sellabilityLabel?: string;
  readonly description?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly aspectRatio?: LibraryAspectRatio;
  readonly mediaOrientation?: LibraryMediaOrientation;
  readonly share?: LibraryAssetShareViewModel | null;
}

export const LIBRARY_GRID_DENSITY_LAYOUT: Record<LibraryGridDensity, string> = {
  compact: 'grid gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
  comfortable: 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
  spacious: 'grid gap-4 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3',
};

export function getLibraryAssetAspectRatio(
  asset: LibraryReleaseAsset
): LibraryAspectRatio {
  if (asset.aspectRatio) return asset.aspectRatio;

  const itemKind = getLibraryItemKind(asset);
  if (itemKind === 'video') {
    return asset.mediaOrientation === 'portrait' ? '9:16' : '16:9';
  }

  return '1:1';
}

export function getLibraryAspectRatioClass(ratio: LibraryAspectRatio): string {
  switch (ratio) {
    case '16:9':
      return 'aspect-video';
    case '9:16':
      return 'aspect-[9/16]';
    default:
      return 'aspect-square';
  }
}

/**
 * Compact drawer-hero sizing for the narrow right rail.
 *
 * Caps width for square/landscape art and caps HEIGHT for portrait art so a
 * tall 9:16 canvas does not blow the rail out vertically. Returns the wrapper
 * class plus the aspect class; the aspect class keeps the media's true ratio
 * while the cap that does not match the long axis is effectively inert.
 */
export function getLibraryDrawerHeroClass(ratio: LibraryAspectRatio): string {
  const aspectClass = getLibraryAspectRatioClass(ratio);
  // Portrait: bound by height so width derives down from the cap.
  if (ratio === '9:16') {
    return `${aspectClass} mx-auto h-full max-h-72 w-auto`;
  }
  // Square / landscape: bound by width.
  return `${aspectClass} mx-auto w-full max-w-56`;
}

function normalizeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function resolveLibraryApprovalStatus(
  assetId: string,
  approvalStatusByAssetId?: ReadonlyMap<string, LibraryApprovalStatus>
): LibraryApprovalStatus {
  return (
    approvalStatusByAssetId?.get(assetId) ?? DEFAULT_LIBRARY_APPROVAL_STATUS
  );
}

export function buildLibraryReleaseAssets(
  releases: readonly ReleaseViewModel[],
  approvalStatusByAssetId?: ReadonlyMap<string, LibraryApprovalStatus>
): LibraryReleaseAsset[] {
  return releases.map(release => {
    const providers = release.providers.flatMap(provider => {
      const url = normalizeHttpUrl(provider.url);
      if (!url) return [];

      return [
        {
          key: provider.key,
          label: provider.label,
          url,
        },
      ];
    });
    const artworkUrl = normalizeHttpUrl(release.artworkUrl);
    const previewUrl = normalizeHttpUrl(release.previewUrl);
    const videoUrl = normalizeHttpUrl(release.canvasVideoUrl);
    const hasArtwork = Boolean(artworkUrl);
    const hasLyrics = Boolean(release.lyrics?.trim());
    const hasVideoLinks = Boolean(release.hasVideoLinks);
    const assetKinds: LibraryAssetKind[] = [];
    if (hasArtwork) assetKinds.push('artwork');
    if (previewUrl) assetKinds.push('preview');
    if (hasLyrics) assetKinds.push('lyrics');
    if (providers.length > 0) assetKinds.push('providers');
    if (hasVideoLinks) assetKinds.push('video');

    return {
      id: release.id,
      title: release.title,
      artist: release.artistNames?.[0]?.trim() || 'Unknown Artist',
      artworkUrl,
      previewUrl,
      videoUrl,
      waveformSeed: hashLibraryWaveformSeed(release.id),
      smartLinkPath: release.smartLinkPath,
      releaseDate: release.releaseDate ?? null,
      releaseType: release.releaseType,
      status: release.status,
      approvalStatus: resolveLibraryApprovalStatus(
        release.id,
        approvalStatusByAssetId
      ),
      trackCount: release.totalTracks,
      providerCount: providers.length,
      providers,
      hasLyrics,
      hasArtwork,
      hasVideoLinks,
      assetKinds,
      genres:
        release.genres
          ?.map(genre => genre.trim())
          .filter(Boolean)
          .slice(0, 4) ?? [],
      spotifyPopularity: release.spotifyPopularity ?? null,
      targetPlaylistCount: release.targetPlaylists?.length ?? 0,
      isExplicit: release.isExplicit,
      label: release.label?.trim() || null,
      upc: release.upc?.trim() || null,
      distributor: release.distributor?.trim() || null,
      totalDurationMs: release.totalDurationMs ?? null,
    };
  });
}

function formatMerchCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function merchStatusToReleaseStatus(
  status: LibraryMerchCard['status']
): ReleaseViewModel['status'] {
  if (status === 'live') return 'released';
  if (status === 'paused') return 'scheduled';
  return 'draft';
}

function formatMerchStatus(status: LibraryMerchCard['status']): string {
  return status
    .split('_')
    .map(part => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildLibraryMerchAssets(
  cards: readonly LibraryMerchCard[],
  artistName: string,
  approvalStatusByAssetId?: ReadonlyMap<string, LibraryApprovalStatus>
): LibraryReleaseAsset[] {
  return cards.map(card => {
    const imageUrl = normalizeHttpUrl(card.primaryImageUrl);
    const assetId = `merch-${card.id}`;
    return {
      itemKind: 'merch',
      id: assetId,
      title: card.title,
      artist: artistName,
      artworkUrl: imageUrl,
      previewUrl: null,
      videoUrl: null,
      waveformSeed: hashLibraryWaveformSeed(assetId),
      smartLinkPath: '/app/library?view=merch',
      releaseDate: card.publishedAt ?? card.updatedAt,
      releaseType: 'single',
      status: merchStatusToReleaseStatus(card.status),
      approvalStatus: resolveLibraryApprovalStatus(
        assetId,
        approvalStatusByAssetId
      ),
      trackCount: 0,
      providerCount: 0,
      providers: [],
      hasLyrics: false,
      hasArtwork: Boolean(imageUrl),
      hasVideoLinks: false,
      assetKinds: imageUrl ? ['artwork'] : [],
      genres: [],
      spotifyPopularity: null,
      targetPlaylistCount: 0,
      isExplicit: false,
      label: null,
      upc: null,
      distributor: null,
      totalDurationMs: null,
      itemStatusLabel: formatMerchStatus(card.status),
      primaryActionLabel: 'Open Merch',
      primaryActionHref: '/app/library?view=merch',
      productType: card.productType,
      salePriceLabel: formatMerchCents(card.retailPriceCents),
      profitLabel: formatMerchCents(card.artistPayoutPerUnitEstimateCents),
      sellabilityLabel: card.sellable
        ? 'Ready To Sell'
        : (card.sellabilityReasons?.[0] ?? 'Blocked'),
      description: card.description,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };
  });
}

export function getLibraryItemKind(
  asset: LibraryReleaseAsset
): LibraryItemKind {
  return asset.itemKind ?? 'release';
}

export function libraryAssetMatchesView(
  asset: LibraryReleaseAsset,
  view: LibraryView
): boolean {
  const itemKind = getLibraryItemKind(asset);
  if (view === 'all') return true;
  if (view === 'releases') return itemKind === 'release';
  if (view === 'merch') return itemKind === 'merch';
  if (view === 'images') return asset.assetKinds.includes('artwork');
  if (view === 'videos') return asset.assetKinds.includes('video');
  return Boolean(asset.previewUrl);
}

export function formatLibraryReleaseDate(value: string | null): string {
  if (!value) return 'No Release Date';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No Release Date';

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatLibraryDuration(value: number | null): string {
  if (!value || value <= 0) return 'No Duration';

  const totalSeconds = Math.round(value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Version suffixes that mark the same release re-ingested under a variant
// title — "All This Noise (Remixed)", "All This Noise EP", "Song - Deluxe".
const LIBRARY_VERSION_TAG_PATTERN = /\s*[[(][^\])]*[\])]\s*/g;
const LIBRARY_VERSION_SUFFIX_PATTERN =
  /[\s–—-]+(ep|single|album|lp|deluxe|remix|remixed|remaster|remastered|edit|version|acoustic|live)$/i;

/**
 * Normalize a release title so version variants of one release share a key.
 * Bracketed tags ("(Remixed)") and trailing format/version words ("EP",
 * "- Deluxe") are stripped; case and whitespace are collapsed.
 */
export function normalizeLibraryVersionTitle(title: string): string {
  let normalized = title
    .toLowerCase()
    .replace(LIBRARY_VERSION_TAG_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (
    let stripped = normalized
      .replace(LIBRARY_VERSION_SUFFIX_PATTERN, '')
      .trim();
    stripped.length > 0 && stripped !== normalized;
    stripped = normalized.replace(LIBRARY_VERSION_SUFFIX_PATTERN, '').trim()
  ) {
    normalized = stripped;
  }

  return normalized || title.trim().toLowerCase();
}

function libraryVersionGroupKey(asset: LibraryReleaseAsset): string {
  return `${asset.artist.trim().toLowerCase()}::${normalizeLibraryVersionTitle(asset.title)}`;
}

function libraryReleaseDateTime(asset: LibraryReleaseAsset): number {
  if (!asset.releaseDate) return 0;
  const time = new Date(asset.releaseDate).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * The canonical row for a version group is the most complete ingest: most
 * tracks, then most provider links, then the newest release date.
 */
function isMoreCanonicalVersion(
  candidate: LibraryReleaseAsset,
  current: LibraryReleaseAsset
): boolean {
  if (candidate.trackCount !== current.trackCount) {
    return candidate.trackCount > current.trackCount;
  }
  if (candidate.providerCount !== current.providerCount) {
    return candidate.providerCount > current.providerCount;
  }
  return libraryReleaseDateTime(candidate) > libraryReleaseDateTime(current);
}

/**
 * Version-stack duplicate ingests of the same release into one row (JOV-3089).
 * Release-kind assets grouped by artist + normalized title collapse to their
 * most complete row; merch and other item kinds pass through untouched, and
 * the surviving row keeps its original list position.
 */
export function stackLibraryReleaseVersions(
  assets: readonly LibraryReleaseAsset[]
): LibraryReleaseAsset[] {
  const canonicalByKey = new Map<string, LibraryReleaseAsset>();

  for (const asset of assets) {
    if (getLibraryItemKind(asset) !== 'release') continue;
    const key = libraryVersionGroupKey(asset);
    const current = canonicalByKey.get(key);
    if (!current || isMoreCanonicalVersion(asset, current)) {
      canonicalByKey.set(key, asset);
    }
  }

  return assets.filter(
    asset =>
      getLibraryItemKind(asset) !== 'release' ||
      canonicalByKey.get(libraryVersionGroupKey(asset))?.id === asset.id
  );
}
