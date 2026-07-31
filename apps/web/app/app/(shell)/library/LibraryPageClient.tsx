'use client';

import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import type { LibraryProfileVisibility } from '@/lib/library/profile-visibility';
import type { LibraryMerchCard } from '@/lib/merch/types';
import { ReleaseCatalogPageClient } from '../dashboard/releases/ReleaseCatalogPageClient';

export function LibraryPageClient({
  merchCards,
  approvalStatusByAssetId = {},
  profileVisibilityByAssetId = {},
  assetShareByAssetId = {},
}: {
  readonly merchCards: readonly LibraryMerchCard[];
  readonly approvalStatusByAssetId?: Readonly<Record<string, string>>;
  readonly profileVisibilityByAssetId?: Readonly<
    Record<string, LibraryProfileVisibility>
  >;
  readonly assetShareByAssetId?: Readonly<
    Record<string, LibraryAssetShareViewModel>
  >;
}) {
  return (
    <ReleaseCatalogPageClient
      view='assets'
      merchCards={merchCards}
      approvalStatusByAssetId={approvalStatusByAssetId}
      profileVisibilityByAssetId={profileVisibilityByAssetId}
      assetShareByAssetId={assetShareByAssetId}
    />
  );
}
