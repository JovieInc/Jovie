'use client';

import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import type { LibraryMerchCard } from '@/lib/merch/types';
import { ReleaseCatalogPageClient } from '../dashboard/releases/ReleaseCatalogPageClient';

export function LibraryPageClient({
  merchCards,
  approvalStatusByAssetId = {},
  assetShareByAssetId = {},
}: {
  readonly merchCards: readonly LibraryMerchCard[];
  readonly approvalStatusByAssetId?: Readonly<Record<string, string>>;
  readonly assetShareByAssetId?: Readonly<
    Record<string, LibraryAssetShareViewModel>
  >;
}) {
  return (
    <ReleaseCatalogPageClient
      view='assets'
      merchCards={merchCards}
      approvalStatusByAssetId={approvalStatusByAssetId}
      assetShareByAssetId={assetShareByAssetId}
    />
  );
}
