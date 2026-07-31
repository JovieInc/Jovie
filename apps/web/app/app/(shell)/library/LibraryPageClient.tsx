'use client';

import type { ReleaseViewModel } from '@/lib/discography/types';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import type { LibraryProfileVisibility } from '@/lib/library/profile-visibility';
import type { LibraryMerchCard } from '@/lib/merch/types';
import { ReleaseCatalogPageClient } from '../dashboard/releases/ReleaseCatalogPageClient';

export function LibraryPageClient({
  merchCards,
  archivedMerchCards = [],
  archivedReleases = [],
  approvalStatusByAssetId = {},
  profileVisibilityByAssetId = {},
  assetShareByAssetId = {},
}: {
  readonly merchCards: readonly LibraryMerchCard[];
  readonly archivedMerchCards?: readonly LibraryMerchCard[];
  readonly archivedReleases?: readonly ReleaseViewModel[];
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
      archivedMerchCards={archivedMerchCards}
      archivedReleases={archivedReleases}
      approvalStatusByAssetId={approvalStatusByAssetId}
      profileVisibilityByAssetId={profileVisibilityByAssetId}
      assetShareByAssetId={assetShareByAssetId}
    />
  );
}
