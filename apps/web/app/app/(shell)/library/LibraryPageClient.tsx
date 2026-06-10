'use client';

import type { LibraryMerchCard } from '@/lib/merch/types';
import { ReleaseCatalogPageClient } from '../dashboard/releases/ReleaseCatalogPageClient';

export function LibraryPageClient({
  merchCards,
  approvalStatusByAssetId = {},
}: {
  readonly merchCards: readonly LibraryMerchCard[];
  readonly approvalStatusByAssetId?: Readonly<Record<string, string>>;
}) {
  return (
    <ReleaseCatalogPageClient
      view='assets'
      merchCards={merchCards}
      approvalStatusByAssetId={approvalStatusByAssetId}
    />
  );
}
