import type { ReleaseViewModel } from '@/lib/discography/types';
import type { LibraryMerchCard } from '@/lib/merch/types';

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

export interface LibraryReleaseAsset {
  readonly itemKind?: LibraryItemKind;
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly artworkUrl: string | null;
  readonly previewUrl: string | null;
  readonly smartLinkPath: string;
  readonly releaseDate: string | null;
  readonly releaseType: ReleaseViewModel['releaseType'];
  readonly status: ReleaseViewModel['status'];
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
  readonly retailPriceLabel?: string;
  readonly artistPayoutLabel?: string;
  readonly jovieMarginLabel?: string;
  readonly sellabilityLabel?: string;
  readonly description?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

function normalizeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

export function buildLibraryReleaseAssets(
  releases: readonly ReleaseViewModel[]
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
      smartLinkPath: release.smartLinkPath,
      releaseDate: release.releaseDate ?? null,
      releaseType: release.releaseType,
      status: release.status,
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
  artistName: string
): LibraryReleaseAsset[] {
  return cards.map(card => {
    const imageUrl = normalizeHttpUrl(card.primaryImageUrl);
    return {
      itemKind: 'merch',
      id: `merch-${card.id}`,
      title: card.title,
      artist: artistName,
      artworkUrl: imageUrl,
      previewUrl: null,
      smartLinkPath: '/app/library?view=merch',
      releaseDate: card.publishedAt ?? card.updatedAt,
      releaseType: 'single',
      status: merchStatusToReleaseStatus(card.status),
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
      retailPriceLabel: formatMerchCents(card.retailPriceCents),
      artistPayoutLabel: formatMerchCents(
        card.artistPayoutPerUnitEstimateCents
      ),
      jovieMarginLabel: formatMerchCents(card.jovieMarginPerUnitEstimateCents),
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
