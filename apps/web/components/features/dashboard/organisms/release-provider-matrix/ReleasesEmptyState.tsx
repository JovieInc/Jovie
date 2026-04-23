'use client';

import { Icon } from '@/components/atoms/Icon';
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
  const emptyCardClassName =
    'flex min-h-[212px] flex-col items-center justify-center px-5 py-9 text-center';

  // During enrichment: show progress message
  if (enrichmentStatus === 'enriching') {
    return (
      <DrawerSurfaceCard
        variant='card'
        className={emptyCardClassName}
        testId='releases-empty-state-enriching'
      >
        <div className='mb-2.5 flex h-9 w-9 items-center justify-center rounded-[10px] border border-subtle bg-surface-1'>
          <Icon name='Sparkles' className='h-4 w-4 text-tertiary-token' />
        </div>
        <div className='mb-2.5 h-4.5 w-4.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent' />
        <h3 className='text-app font-[510] text-primary-token'>
          Finding your music...
        </h3>
        <p className='mt-0.5 max-w-sm text-xs leading-[17px] text-secondary-token'>
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
        className={emptyCardClassName}
        testId='releases-empty-state-partial'
      >
        <div className='mb-2.5 flex h-9 w-9 items-center justify-center rounded-[10px] border border-subtle bg-surface-1'>
          <Icon name='Disc3' className='h-4 w-4 text-tertiary-token' />
        </div>
        <h3 className='text-app font-[510] text-primary-token'>
          We found some of your music
        </h3>
        <p className='mt-0.5 max-w-sm text-xs leading-[17px] text-secondary-token'>
          We couldn&apos;t find all your streaming links. You can add missing
          ones manually or try again.
        </p>
        {onRetryEnrichment && (
          <DrawerButton
            tone='secondary'
            onClick={onRetryEnrichment}
            className='mt-3 h-7 rounded-[8px] px-2.5 text-2xs'
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
        className={emptyCardClassName}
        testId='releases-empty-state-failed'
      >
        <div className='mb-2.5 flex h-9 w-9 items-center justify-center rounded-[10px] border border-subtle bg-surface-1'>
          <Icon name='SearchX' className='h-4 w-4 text-tertiary-token' />
        </div>
        <h3 className='text-app font-[510] text-primary-token'>
          We had trouble finding your music
        </h3>
        <p className='mt-0.5 max-w-sm text-xs leading-[17px] text-secondary-token'>
          Something went wrong while searching streaming platforms. You can try
          again or add your releases manually.
        </p>
        {onRetryEnrichment && (
          <DrawerButton
            tone='primary'
            onClick={onRetryEnrichment}
            className='mt-3 h-7 rounded-[8px] px-2.5 text-2xs'
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
      className={emptyCardClassName}
      testId='releases-empty-state-disconnected'
    >
      <div className='mb-2.5 flex h-9 w-9 items-center justify-center rounded-[10px] border border-subtle bg-surface-1'>
        <Icon name='Disc3' className='h-4 w-4 text-tertiary-token' />
      </div>
      <h3 className='text-app font-[510] text-primary-token'>
        Connect Spotify
      </h3>
      <p className='mt-0.5 max-w-sm text-xs leading-[17px] text-secondary-token'>
        Search your artist profile to import releases.
      </p>
      <DrawerButton
        tone='primary'
        onClick={onConnectSpotify}
        className='mt-3 h-7 rounded-[8px] px-2.5 text-2xs'
      >
        Connect Spotify
      </DrawerButton>
    </DrawerSurfaceCard>
  );
}
