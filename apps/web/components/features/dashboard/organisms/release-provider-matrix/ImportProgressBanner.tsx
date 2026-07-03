'use client';

import { ProgressBar, Spinner } from '@jovie/ui';
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

  const progressPercent =
    totalCount > 0 ? (importedCount / totalCount) * 100 : undefined;

  if (compact) {
    return (
      <div
        className='system-b-release-provider-banner--spotify system-b-release-provider-banner-compact inline-flex h-7.5 items-center gap-2 rounded-md border px-2.5 text-xs text-primary-token'
        aria-live='polite'
      >
        <ProviderIcon provider='spotify' className='h-3.5 w-3.5 shrink-0' />
        <span className='max-w-45 truncate text-secondary-token'>
          {artistName ? `Importing ${artistName}` : 'Importing from Spotify'}
        </span>
        <span className='shrink-0 text-tertiary-token tabular-nums'>
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
        className='system-b-release-provider-banner system-b-release-provider-banner--spotify flex items-center gap-3 border px-4 py-3 transition-opacity duration-subtle'
      >
        <ProviderIcon provider='spotify' className='h-4.5 w-4.5' />
        <div className='flex min-w-0 flex-1 flex-col gap-1'>
          <div className='flex items-center gap-2 text-app text-primary-token'>
            <span className='truncate'>
              {artistName
                ? `Importing releases from ${artistName}...`
                : 'Importing releases from Spotify...'}
            </span>
            <span className='shrink-0 text-2xs text-secondary-token tabular-nums'>
              {totalCount > 0
                ? `${importedCount} of ${totalCount} imported`
                : `${importedCount} imported`}
            </span>
          </div>
          <ProgressBar
            value={progressPercent}
            trackClassName='system-b-release-provider-progress-track h-1 bg-transparent'
            fillClassName='system-b-release-provider-progress-fill bg-transparent'
            className='space-y-0'
            aria-label={progressLabel}
          />
        </div>
      </DrawerSurfaceCard>
      {enrichmentStatus === 'enriching' && (
        <DrawerSurfaceCard
          variant='card'
          data-testid='release-enrichment-progress-banner'
          className='system-b-release-provider-banner system-b-release-provider-banner--accent mt-2 flex items-center gap-3 border px-4 py-3 transition-opacity duration-subtle'
        >
          <Spinner
            size='sm'
            tone='muted'
            label='Finding music across streaming platforms'
          />
          <div className='flex min-w-0 flex-1 flex-col gap-1'>
            <span className='text-app text-primary-token'>
              Finding your music across streaming platforms...
            </span>
            <ProgressBar
              indeterminate
              trackClassName='system-b-release-provider-progress-track h-1 overflow-hidden rounded-full bg-transparent'
              fillClassName='system-b-release-provider-progress-fill h-full rounded-full bg-transparent'
              className='space-y-0'
            />
          </div>
        </DrawerSurfaceCard>
      )}
    </div>
  );
});