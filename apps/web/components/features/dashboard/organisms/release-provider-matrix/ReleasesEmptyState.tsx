'use client';

// @coverage-via apps/web/tests/components/release-provider-matrix/ReleasesEmptyState.test.tsx

import { Disc3, Loader2, SearchX } from 'lucide-react';
import {
  TableEmptyState,
  type TableEmptyStateProps,
} from '@/components/organisms/table';
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
  const retryAction: TableEmptyStateProps['action'] = onRetryEnrichment
    ? { label: 'Try Again', onClick: onRetryEnrichment }
    : undefined;

  // During enrichment: show progress message
  if (enrichmentStatus === 'enriching') {
    return (
      <TableEmptyState
        icon={
          <Loader2
            className='h-5 w-5 animate-spin motion-reduce:animate-none'
            aria-hidden='true'
          />
        }
        heading='Finding Your Music'
        description='We are discovering your releases across streaming platforms. This usually takes a few seconds.'
        testId='releases-empty-state-enriching'
      />
    );
  }

  // After partial enrichment: some worked, some didn't
  if (enrichmentStatus === 'partial') {
    return (
      <TableEmptyState
        icon={<Disc3 className='h-5 w-5' aria-hidden='true' />}
        heading='Some Music Found'
        description='Some streaming links were not found. Add them manually or try again.'
        action={retryAction}
        testId='releases-empty-state-partial'
      />
    );
  }

  // After failure: enrichment completely failed
  if (enrichmentStatus === 'failed') {
    return (
      <TableEmptyState
        icon={<SearchX className='h-5 w-5' aria-hidden='true' />}
        heading='Music Search Failed'
        description='Something went wrong while searching streaming platforms. Try again or add releases manually.'
        variant='error'
        action={retryAction}
        testId='releases-empty-state-failed'
      />
    );
  }

  // Default: no Spotify connected
  return (
    <TableEmptyState
      icon={<Disc3 className='h-5 w-5' aria-hidden='true' />}
      heading='Connect Spotify'
      description='Search your artist profile to import releases.'
      action={{ label: 'Connect Spotify', onClick: onConnectSpotify }}
      testId='releases-empty-state-disconnected'
    />
  );
}
