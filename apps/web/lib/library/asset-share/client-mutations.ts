'use client';

import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { getLibraryItemKind } from '@/app/app/(shell)/library/library-data';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';

export function buildLibraryAssetShareRequestBody(
  asset: LibraryReleaseAsset,
  profileId: string,
  extra: Record<string, unknown> = {}
) {
  return {
    profileId,
    assetId: asset.id,
    itemKind: getLibraryItemKind(asset),
    title: asset.title,
    smartLinkPath: asset.smartLinkPath,
    ...extra,
  };
}

export async function requestLibraryAssetShareMutation(
  endpoint: string,
  method: 'POST' | 'PATCH',
  body: Record<string, unknown>
): Promise<LibraryAssetShareViewModel> {
  const response = await fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('Share mutation failed');
  }

  const payload = (await response.json()) as {
    readonly share?: LibraryAssetShareViewModel;
  };

  if (!payload.share) {
    throw new Error('Share mutation missing payload');
  }

  return payload.share;
}
