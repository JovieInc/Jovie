'use client';

import { DrawerButton, DrawerSurfaceCard } from '@/components/molecules/drawer';
import type { AggregateEnrichmentStatus } from '@/lib/dsp-enrichment/enrichment-status';

interface ReleasesEmptyStateProps {
  readonly onConnectSpotify: () => void;
  readonly enrichmentStatus?: AggregateEnrichmentStatus;
  readonly onRetryEnrichment?: () => void;
}

export function ReleasesEmptyState({
  onConnectSpotify,
  enrichmentStatus,
  onRetryEnrichment,
}: ReleasesEmptyStateProps) {
  // During enrichment: show progress message
  if (enrichmentStatus === 'enriching') {
    return (
      <DrawerSurfaceCard
        variant='card'
        className='flex min-h-[220px] flex-col items-center justify-center rounded-[10px] px-4 py-12 text-center'
      >
        <div className='mb-3 h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent' />
        <h3 className='text-[13px] font-[510] text-primary-token'>
          Finding your music...
        </h3>
        <p className='mt-1 max-w-sm text-[12px] leading-[17px] text-secondary-token'>
          We&apos;re discovering your releases across streaming platforms. This
          usually takes a few seconds.
        </p>
      </DrawerSurfaceCard>
    );
  }

  // After partial enrichment: some worked, some didn't
  if (enrichmentStatus === 'partial') {
    return (
      <DrawerSurfaceCard
        variant='card'
        className='flex min-h-[220px] flex-col items-center justify-center rounded-[10px] px-4 py-12 text-center'
      >
        <h3 className='text-[13px] font-[510] text-primary-token'>
          We found some of your music
        </h3>
        <p className='mt-1 max-w-sm text-[12px] leading-[17px] text-secondary-token'>
          We couldn&apos;t find all your streaming links. You can add missing
          ones manually or try again.
        </p>
        {onRetryEnrichment && (
          <DrawerButton
            tone='secondary'
            onClick={onRetryEnrichment}
            className='mt-4'
          >
            Try again
          </DrawerButton>
        )}
      </DrawerSurfaceCard>
    );
  }

  // After failure: enrichment completely failed
  if (enrichmentStatus === 'failed') {
    return (
      <DrawerSurfaceCard
        variant='card'
        className='flex min-h-[220px] flex-col items-center justify-center rounded-[10px] px-4 py-12 text-center'
      >
        <h3 className='text-[13px] font-[510] text-primary-token'>
          We had trouble finding your music
        </h3>
        <p className='mt-1 max-w-sm text-[12px] leading-[17px] text-secondary-token'>
          Something went wrong while searching streaming platforms. You can try
          again or add your releases manually.
        </p>
        {onRetryEnrichment && (
          <DrawerButton
            tone='primary'
            onClick={onRetryEnrichment}
            className='mt-4'
          >
            Try again
          </DrawerButton>
        )}
      </DrawerSurfaceCard>
    );
  }

  // Default: no Spotify connected
  return (
    <DrawerSurfaceCard
      variant='card'
      className='flex min-h-[220px] flex-col items-center justify-center rounded-[10px] px-4 py-12 text-center'
    >
      <h3 className='text-[13px] font-[510] text-primary-token'>
        Connect Spotify
      </h3>
      <p className='mt-1 max-w-sm text-[12px] leading-[17px] text-secondary-token'>
        Search your artist profile to import releases.
      </p>
      <DrawerButton tone='primary' onClick={onConnectSpotify} className='mt-4'>
        Connect Spotify
      </DrawerButton>
    </DrawerSurfaceCard>
  );
}
