import type { LibraryShareDropLayout } from '@/lib/db/schema/library-share-drops';
import type { LibraryShareDropAsset } from '@/lib/library-share/types';
import { LibraryShareAssetCard } from './LibraryShareAssetCard';

interface LibraryShareAssetLayoutsProps {
  readonly assets: readonly LibraryShareDropAsset[];
  readonly layout: LibraryShareDropLayout;
  readonly downloadsEnabled: boolean;
}

export function LibraryShareAssetLayouts({
  assets,
  layout,
  downloadsEnabled,
}: LibraryShareAssetLayoutsProps) {
  if (assets.length === 0) {
    return (
      <div
        className='rounded-2xl border border-dashed border-subtle px-6 py-16 text-center text-sm text-secondary-token'
        data-testid='library-share-empty'
      >
        No assets in this drop yet.
      </div>
    );
  }

  if (layout === 'list') {
    return (
      <div
        className='flex flex-col gap-3'
        data-testid='library-share-layout-list'
      >
        {assets.map((asset, index) => (
          <LibraryShareAssetCard
            key={asset.id}
            asset={asset}
            downloadsEnabled={downloadsEnabled}
            layout='list'
            priorityArtwork={index === 0}
          />
        ))}
      </div>
    );
  }

  if (layout === 'reel') {
    return (
      <div
        className='flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory'
        data-testid='library-share-layout-reel'
      >
        {assets.map((asset, index) => (
          <LibraryShareAssetCard
            key={asset.id}
            asset={asset}
            downloadsEnabled={downloadsEnabled}
            layout='reel'
            priorityArtwork={index === 0}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
      data-testid='library-share-layout-grid'
    >
      {assets.map((asset, index) => (
        <LibraryShareAssetCard
          key={asset.id}
          asset={asset}
          downloadsEnabled={downloadsEnabled}
          layout='grid'
          priorityArtwork={index === 0}
        />
      ))}
    </div>
  );
}
