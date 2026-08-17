'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CreatorDocumentListItem } from '@/lib/creator-documents/types';
import type { ReleaseViewModel } from '@/lib/discography/types';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import type { LibraryProfileVisibility } from '@/lib/library/profile-visibility';
import type { LibraryMerchCard } from '@/lib/merch/types';
import { ReleaseCatalogPageClient } from '../dashboard/releases/ReleaseCatalogPageClient';
import { CreatorDocumentsWorkspace } from './CreatorDocumentsWorkspace';

export function LibraryPageClient({
  merchCards,
  archivedMerchCards = [],
  archivedReleases = [],
  approvalStatusByAssetId = {},
  profileVisibilityByAssetId = {},
  assetShareByAssetId = {},
  creatorDocuments = [],
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
  readonly creatorDocuments?: readonly CreatorDocumentListItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode =
    searchParams.get('section') === 'documents' ? 'documents' : 'assets';
  const setMode = (nextMode: 'assets' | 'documents') => {
    const next = new URLSearchParams(searchParams.toString());
    if (nextMode === 'assets') next.delete('section');
    else next.set('section', 'documents');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div
        role='tablist'
        aria-label='Library Sections'
        className='flex h-10 shrink-0 items-center gap-1 border-b border-subtle px-3'
      >
        <button
          type='button'
          id='library-assets-tab'
          role='tab'
          aria-selected={mode === 'assets'}
          aria-controls='library-assets-panel'
          onClick={() => setMode('assets')}
          className='rounded-md px-3 py-1 text-sm text-secondary-token aria-selected:bg-surface-1 aria-selected:text-primary-token'
        >
          Assets
        </button>
        <button
          type='button'
          id='library-documents-tab'
          role='tab'
          aria-selected={mode === 'documents'}
          aria-controls='library-documents-panel'
          onClick={() => setMode('documents')}
          className='rounded-md px-3 py-1 text-sm text-secondary-token aria-selected:bg-surface-1 aria-selected:text-primary-token'
        >
          Ideas &amp; scripts
        </button>
      </div>
      {mode === 'documents' ? (
        <div
          id='library-documents-panel'
          role='tabpanel'
          aria-labelledby='library-documents-tab'
          className='flex min-h-0 flex-1'
        >
          <CreatorDocumentsWorkspace initialDocuments={creatorDocuments} />
        </div>
      ) : (
        <div
          id='library-assets-panel'
          role='tabpanel'
          aria-labelledby='library-assets-tab'
          className='flex min-h-0 flex-1'
        >
          <ReleaseCatalogPageClient
            view='assets'
            merchCards={merchCards}
            archivedMerchCards={archivedMerchCards}
            archivedReleases={archivedReleases}
            approvalStatusByAssetId={approvalStatusByAssetId}
            profileVisibilityByAssetId={profileVisibilityByAssetId}
            assetShareByAssetId={assetShareByAssetId}
          />
        </div>
      )}
    </div>
  );
}
