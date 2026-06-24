'use client';

import { motion } from 'motion/react';
import { memo } from 'react';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { DrawerSurfaceCard } from '@/components/molecules/drawer';
import type { AggregateEnrichmentStatus } from '@/lib/dsp-enrichment/enrichment-status';

const SPRING = {
  type: 'spring',
  damping: 10,
  mass: 0.75,
  stiffness: 100,
} as const;

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
          <div
            className='system-b-release-provider-progress-track h-1 w-full overflow-hidden rounded-full'
            role='progressbar'
            aria-valuenow={
              totalCount > 0
                ? Math.round((importedCount / totalCount) * 100)
                : undefined
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={progressLabel}
          >
            <motion.div
              className='system-b-release-provider-progress-fill h-full rounded-full'
              initial={{ width: 0 }}
              animate={{
                width:
                  totalCount > 0
                    ? `${(importedCount / totalCount) * 100}%`
                    : '0%',
              }}
              transition={SPRING}
            />
          </div>
        </div>
      </DrawerSurfaceCard>
      {enrichmentStatus === 'enriching' && (
        <DrawerSurfaceCard
          variant='card'
          data-testid='release-enrichment-progress-banner'
          className='system-b-release-provider-banner system-b-release-provider-banner--accent mt-2 flex items-center gap-3 border px-4 py-3 transition-opacity duration-subtle'
        >
          <div className='flex h-5 w-5 items-center justify-center'>
            <div className='system-b-release-provider-spinner h-4 w-4 animate-spin rounded-full border-2' />
          </div>
          <div className='flex min-w-0 flex-1 flex-col gap-1'>
            <span className='text-app text-primary-token'>
              Finding your music across streaming platforms...
            </span>
            <div className='system-b-release-provider-progress-track h-1 overflow-hidden rounded-full'>
              <div className='system-b-release-provider-progress-fill h-full w-1/3 animate-[progress-indeterminate_1.5s_ease-in-out_infinite] rounded-full' />
            </div>
          </div>
        </DrawerSurfaceCard>
      )}
    </div>
  );
});
