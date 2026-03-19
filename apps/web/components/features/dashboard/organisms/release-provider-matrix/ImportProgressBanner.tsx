'use client';

import { memo } from 'react';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { DrawerSurfaceCard } from '@/components/molecules/drawer';

interface ImportProgressBannerProps {
  readonly artistName: string | null;
  readonly importedCount: number;
  readonly totalCount: number;
  readonly visible?: boolean;
  readonly compact?: boolean;
}

export const ImportProgressBanner = memo(function ImportProgressBanner({
  artistName,
  importedCount,
  totalCount,
  visible = true,
  compact = false,
}: ImportProgressBannerProps) {
  const progressLabel =
    totalCount > 0
      ? `Importing releases: ${importedCount} of ${totalCount}`
      : `Importing releases: ${importedCount} imported`;

  if (compact) {
    return (
      <div
        className='inline-flex h-8 items-center gap-2 rounded-full border border-[#1DB954]/18 bg-[#1DB954]/8 px-3 text-[12px] text-primary-token'
        aria-live='polite'
      >
        <ProviderIcon provider='spotify' className='h-3.5 w-3.5 shrink-0' />
        <span className='max-w-[180px] truncate text-secondary-token'>
          {artistName ? `Importing ${artistName}` : 'Importing from Spotify'}
        </span>
        <span className='shrink-0 text-tertiary-token'>
          · {totalCount > 0 ? `${importedCount}/${totalCount}` : importedCount}
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
      <DrawerSurfaceCard
        variant='card'
        className='mx-4 mt-2 flex items-center gap-3 border-[#1DB954]/18 bg-[#1DB954]/6 px-4 py-3 transition-opacity duration-200'
      >
        <ProviderIcon provider='spotify' className='h-5 w-5' />
        <div className='flex min-w-0 flex-1 flex-col gap-1'>
          <div className='flex items-center gap-2 text-[13px] text-primary-token'>
            <span className='truncate'>
              {artistName
                ? `Importing releases from ${artistName}...`
                : 'Importing releases from Spotify...'}
            </span>
            <span className='shrink-0 text-[11px] text-secondary-token'>
              {totalCount > 0
                ? `${importedCount} of ${totalCount} imported`
                : `${importedCount} imported`}
            </span>
          </div>
          <div
            className='h-1 overflow-hidden rounded-full bg-[#1DB954]/12'
            role='progressbar'
            aria-valuenow={importedCount}
            aria-valuemax={totalCount > 0 ? totalCount : undefined}
            aria-label={progressLabel}
          >
            {totalCount > 0 ? (
              <div
                className='h-full rounded-full bg-[#1DB954] transition-[width] duration-700 ease-out'
                style={{
                  width: `${Math.min((importedCount / totalCount) * 100, 100)}%`,
                }}
              />
            ) : (
              <div className='h-full w-full animate-[progress-shimmer_2.5s_linear_infinite] rounded-full bg-gradient-to-r from-transparent via-[#1DB954]/60 to-transparent bg-[length:200%_100%]' />
            )}
          </div>
        </div>
      </DrawerSurfaceCard>
    </div>
  );
});
