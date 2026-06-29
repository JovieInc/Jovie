import type { LibraryItemKind } from '@/app/app/(shell)/library/library-data';
import { BASE_URL } from '@/constants/app';
import {
  LIBRARY_ASSET_PRIVATE_ROUTE_PREFIX,
  LIBRARY_ASSET_PUBLIC_ROUTE_PREFIX,
} from './asset-share/constants';

export type LibraryAssetVisibility = 'public' | 'private';

export const LIBRARY_ASSET_VISIBILITY_OPTIONS: readonly LibraryAssetVisibility[] =
  ['public', 'private'] as const;

export const DEFAULT_LIBRARY_ASSET_VISIBILITY: LibraryAssetVisibility =
  'private';

export interface LibraryAssetShareViewModel {
  readonly assetId: string;
  readonly visibility: LibraryAssetVisibility;
  readonly shareSlug: string;
  readonly accessToken: string;
  readonly shareUrl: string;
  readonly tokenRevokedAt: string | null;
}

export function isLibraryAssetVisibility(
  value: string | null | undefined
): value is LibraryAssetVisibility {
  return value === 'public' || value === 'private';
}

export function formatLibraryAssetVisibility(
  visibility: LibraryAssetVisibility
): string {
  return visibility === 'public' ? 'Public' : 'Private';
}

function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

function slugifyShareSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');
  return normalized || 'asset';
}

export function deriveLibraryAssetShareSlug(input: {
  readonly assetId: string;
  readonly itemKind: LibraryItemKind;
  readonly title: string;
  readonly smartLinkPath?: string;
}): string {
  if (input.itemKind === 'release' && input.smartLinkPath) {
    const slug = input.smartLinkPath.split('/').findLast(Boolean);
    if (slug) return slugifyShareSegment(slug);
  }

  if (input.itemKind === 'merch') {
    const merchId = input.assetId.replace(/^merch-/, '');
    return slugifyShareSegment(`merch-${merchId.slice(0, 8)}`);
  }

  const idSuffix = input.assetId.replace(/[^a-z0-9]/gi, '').slice(0, 8);
  return slugifyShareSegment(`${input.title}-${idSuffix}`);
}

export function buildLibraryAssetShareUrl(input: {
  readonly visibility: LibraryAssetVisibility;
  readonly accessToken: string;
  readonly shareSlug: string;
  readonly artistHandle: string;
  readonly itemKind: LibraryItemKind;
  readonly smartLinkPath?: string;
}): string {
  if (input.visibility === 'public') {
    if (input.itemKind === 'release' && input.smartLinkPath) {
      return `${BASE_URL}${input.smartLinkPath}`;
    }

    return `${BASE_URL}${LIBRARY_ASSET_PUBLIC_ROUTE_PREFIX}/${normalizeHandle(input.artistHandle)}/${input.shareSlug}`;
  }

  return `${BASE_URL}${LIBRARY_ASSET_PRIVATE_ROUTE_PREFIX}/${input.accessToken}`;
}

export function toLibraryAssetShareViewModel(input: {
  readonly assetId: string;
  readonly visibility: LibraryAssetVisibility;
  readonly shareSlug: string;
  readonly accessToken: string;
  readonly artistHandle: string;
  readonly itemKind: LibraryItemKind;
  readonly smartLinkPath?: string;
  readonly tokenRevokedAt?: Date | string | null;
}): LibraryAssetShareViewModel {
  const tokenRevokedAt =
    input.tokenRevokedAt instanceof Date
      ? input.tokenRevokedAt.toISOString()
      : (input.tokenRevokedAt ?? null);

  return {
    assetId: input.assetId,
    visibility: input.visibility,
    shareSlug: input.shareSlug,
    accessToken: input.accessToken,
    shareUrl: buildLibraryAssetShareUrl({
      visibility: input.visibility,
      accessToken: input.accessToken,
      shareSlug: input.shareSlug,
      artistHandle: input.artistHandle,
      itemKind: input.itemKind,
      smartLinkPath: input.smartLinkPath,
    }),
    tokenRevokedAt,
  };
}

export function formatLibraryAssetShareDisplayUrl(shareUrl: string): string {
  return shareUrl.replace(/^https?:\/\//, '');
}

export interface LibraryAssetSharePublicView {
  readonly assetId: string;
  readonly itemKind: LibraryItemKind;
  readonly title: string;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly artworkUrl: string | null;
  readonly previewUrl: string | null;
  readonly smartLinkPath: string | null;
  readonly visibility: LibraryAssetVisibility;
}
