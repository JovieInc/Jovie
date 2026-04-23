'use client';

import { memo } from 'react';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { DrawerSurfaceCard } from '@/components/molecules/drawer';
import type { AggregateEnrichmentStatus } from '@/lib/dsp-enrichment/enrichment-status';

interface ImportProgressBannerProps {
  readonly artistName: string | null;
  readonly importedCount: number;
  readonly totalCount: number;
  readonly visible?: boolean;
  readonly compact?: boolean;
  /** Enrichment status for cross-platform DSP discovery */
  readonly enrichmentStatus?: AggregateEnrichmentStatus;
}

export const ImportProgressBanner = memo(function ImportProgressBanner({
  artistName,
  importedCount,
  totalCount,
  visible = true,
  compact = false,
  enrichmentStatus,
}: ImportProgressBannerProps) {
  const progressLabel =
    totalCount > 0
      ? `Importing releases: ${importedCount} of ${totalCount}`
      : `Importing releases: ${importedCount} imported`;

  if (compact) {
    return (
      <div
        className='inline-flex h-7.5 items-center gap-2 rounded-md border border-[#1DB954]/16 bg-[#1DB954]/6 px-2.5 text-[12px] text-primary-token'
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
        className='flex items-center gap-3 rounded-[10px] border border-[#1DB954]/14 bg-[color-mix(in_oklab,#1DB954_4.5%,var(--linear-app-content-surface))] px-4 py-3 transition-opacity duration-200'
      >
        <ProviderIcon provider='spotify' className='h-4.5 w-4.5' />
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
          <progress
            className='h-1 w-full appearance-none overflow-hidden rounded-full bg-[#1DB954]/12 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-[#1DB954] [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-[#1DB954]/12 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[#1DB954] [&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-700 [&::-webkit-progress-value]:ease-out'
            value={totalCount > 0 ? importedCount : undefined}
            max={totalCount > 0 ? totalCount : undefined}
            aria-label={progressLabel}
          />
        </div>
      </DrawerSurfaceCard>
      {enrichmentStatus === 'enriching' && (
        <DrawerSurfaceCard
          variant='card'
          data-testid='release-enrichment-progress-banner'
          className='mt-2 flex items-center gap-3 rounded-[10px] border border-accent/14 bg-[color-mix(in_oklab,var(--linear-accent)_4.5%,var(--linear-app-content-surface))] px-4 py-3 transition-opacity duration-200'
        >
          <div className='flex h-5 w-5 items-center justify-center'>
            <div className='h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent' />
          </div>
          <div className='flex min-w-0 flex-1 flex-col gap-1'>
            <span className='text-[13px] text-primary-token'>
              Finding your music across streaming platforms...
            </span>
            <div className='h-1 overflow-hidden rounded-full bg-accent/12'>
              <div className='h-full w-1/3 animate-[progress-indeterminate_1.5s_ease-in-out_infinite] rounded-full bg-accent' />
            </div>
          </div>
        </DrawerSurfaceCard>
      )}
    </div>
  );
});
