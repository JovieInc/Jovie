'use client';

import type { LibraryMerchCard } from '@/lib/merch/types';
import { ReleaseCatalogPageClient } from '../dashboard/releases/ReleaseCatalogPageClient';

export function LibraryPageClient({
  merchCards,
}: {
  readonly merchCards: readonly LibraryMerchCard[];
}) {
  return <ReleaseCatalogPageClient view='assets' merchCards={merchCards} />;
}
