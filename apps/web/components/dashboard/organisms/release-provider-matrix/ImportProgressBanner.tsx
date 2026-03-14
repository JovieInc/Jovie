'use client';

import { memo } from 'react';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { DrawerSurfaceCard } from '@/components/molecules/drawer';

interface ImportProgressBannerProps {
  readonly artistName: string | null;
  readonly importedCount: number;
  readonly visible?: boolean;
  readonly compact?: boolean;
}

export const ImportProgressBanner = memo(function ImportProgressBanner({
  artistName,
  importedCount,
  visible = true,
  compact = false,
}: ImportProgressBannerProps) {
  if (compact) {
    return (
      <div
        className='inline-flex h-8 items-center gap-2 rounded-full border border-[#1DB954]/18 bg-[#1DB954]/8 px-3 text-[12px] text-(--linear-text-primary)'
        aria-live='polite'
      >
        <ProviderIcon provider='spotify' className='h-3.5 w-3.5 shrink-0' />
        <span className='max-w-[180px] truncate text-(--linear-text-secondary)'>
          {artistName ? `Importing ${artistName}` : 'Importing from Spotify'}
        </span>
        <span className='shrink-0 text-(--linear-text-tertiary)'>
          · {importedCount}
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid='spotify-import-progress-banner'
      aria-hidden={!visible}
      aria-live={visible ? 'polite' : 'off'}
      style={{
        visibility: visible ? 'visible' : 'hidden',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <DrawerSurfaceCard className='mx-4 mt-2 flex items-center gap-3 border-[#1DB954]/18 bg-[#1DB954]/6 px-4 py-3 transition-opacity duration-200'>
        <ProviderIcon provider='spotify' className='h-5 w-5' />
        <div className='flex min-w-0 flex-1 flex-col gap-1'>
          <div className='flex items-center gap-2 text-[13px] text-(--linear-text-primary)'>
            <span className='truncate'>
              {artistName
                ? `Importing releases from ${artistName}...`
                : 'Importing releases from Spotify...'}
            </span>
            <span className='shrink-0 text-[11px] text-(--linear-text-secondary)'>
              {importedCount} imported
            </span>
          </div>
          <div className='h-1 overflow-hidden rounded-full bg-[#1DB954]/12'>
            <div className='h-full w-1/3 animate-[progress-indeterminate_1.5s_ease-in-out_infinite] rounded-full bg-[#1DB954]' />
          </div>
        </div>
      </DrawerSurfaceCard>
    </div>
  );
});
