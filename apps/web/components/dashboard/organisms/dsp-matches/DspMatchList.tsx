'use client';

import { useCallback, useMemo, useState } from 'react';

import { Icon } from '@/components/atoms/Icon';
import { DspMatchCard } from '@/components/dashboard/molecules/DspMatchCard';
import type { DspMatchStatus } from '@/lib/dsp-enrichment/types';
import {
  useConfirmDspMatchMutation,
  useRejectDspMatchMutation,
} from '@/lib/queries/useDspEnrichmentMutations';
import {
  countMatchesByStatus,
  useDspMatchesQuery,
} from '@/lib/queries/useDspMatchesQuery';
import { cn } from '@/lib/utils';

import { DspMatchEmptyState } from './DspMatchEmptyState';

export interface DspMatchListProps {
  profileId: string;
  className?: string;
}

type FilterStatus = DspMatchStatus | 'all';

const STATUS_FILTERS: Array<{ value: FilterStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'suggested', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'auto_confirmed', label: 'Auto-confirmed' },
  { value: 'rejected', label: 'Rejected' },
];

/**
 * DspMatchList - Displays and manages DSP artist match suggestions.
 *
 * Features:
 * - Fetches matches for a profile
 * - Filter by status (all/suggested/confirmed/rejected)
 * - Confirm/reject actions with optimistic updates
 * - Loading and empty states
 *
 * @example
 * <DspMatchList profileId="profile-123" />
 */
export function DspMatchList({ profileId, className }: DspMatchListProps) {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('suggested');

  // Fetch ALL matches for accurate status counts
  const {
    data: allMatches = [],
    isLoading,
    error,
  } = useDspMatchesQuery({
    profileId,
    // No status filter - fetch all matches for accurate counts
  });

  // Filter matches client-side based on selected status
  const displayMatches = useMemo(() => {
    if (statusFilter === 'all') {
      return allMatches;
    }
    return allMatches.filter(match => match.status === statusFilter);
  }, [allMatches, statusFilter]);

  // Mutations
  const confirmMutation = useConfirmDspMatchMutation();
  const rejectMutation = useRejectDspMatchMutation();

  // Status counts from all matches for accurate badge numbers
  const statusCounts = useMemo(() => {
    return countMatchesByStatus(allMatches);
  }, [allMatches]);

  // Handlers
  const handleConfirm = useCallback(
    (matchId: string) => {
      confirmMutation.mutate({ matchId, profileId });
    },
    [confirmMutation, profileId]
  );

  const handleReject = useCallback(
    (matchId: string) => {
      rejectMutation.mutate({ matchId, profileId });
    },
    [rejectMutation, profileId]
  );

  if (error) {
    return (
      <div
        className={cn(
          'rounded-lg border border-red-500/30 bg-red-500/10 p-4',
          className
        )}
      >
        <div className='flex items-center gap-2 text-red-600 dark:text-red-400'>
          <Icon name='AlertCircle' className='h-4 w-4' />
          <span className='text-sm font-medium'>Failed to load matches</span>
        </div>
        <p className='mt-1 text-xs text-red-600/80 dark:text-red-400/80'>
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filter Tabs */}
      <div className='flex items-center gap-1 overflow-x-auto'>
        {STATUS_FILTERS.map(filter => {
          const count =
            filter.value === 'all'
              ? allMatches.length
              : (statusCounts[filter.value as DspMatchStatus] ?? 0);
          const isActive = statusFilter === filter.value;

          return (
            <button
              key={filter.value}
              type='button'
              onClick={() => setStatusFilter(filter.value)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary-token text-on-primary'
                  : 'bg-surface-2 text-secondary-token hover:bg-surface-3'
              )}
            >
              {filter.label}
              {count > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px]',
                    isActive ? 'bg-white/20' : 'bg-surface-3'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className='space-y-3'>
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className='animate-pulse rounded-lg border border-subtle bg-surface-1 p-4'
            >
              <div className='flex items-center gap-3'>
                <div className='h-10 w-10 rounded-full bg-surface-2' />
                <div className='flex-1 space-y-2'>
                  <div className='h-4 w-32 rounded bg-surface-2' />
                  <div className='h-3 w-24 rounded bg-surface-2' />
                </div>
                <div className='space-y-1'>
                  <div className='h-5 w-16 rounded-full bg-surface-2' />
                  <div className='h-5 w-12 rounded-full bg-surface-2' />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && displayMatches.length === 0 && (
        <DspMatchEmptyState status={statusFilter} />
      )}

      {/* Match List */}
      {!isLoading && displayMatches.length > 0 && (
        <div className='space-y-3'>
          {displayMatches.map(match => (
            <DspMatchCard
              key={match.id}
              matchId={match.id}
              providerId={match.providerId}
              externalArtistName={match.externalArtistName}
              externalArtistUrl={match.externalArtistUrl}
              externalArtistImageUrl={match.externalArtistImageUrl}
              confidenceScore={match.confidenceScore}
              confidenceBreakdown={match.confidenceBreakdown}
              matchingIsrcCount={match.matchingIsrcCount}
              status={match.status}
              onConfirm={
                match.status === 'suggested' ? handleConfirm : undefined
              }
              onReject={match.status === 'suggested' ? handleReject : undefined}
              isConfirming={
                confirmMutation.isPending &&
                confirmMutation.variables?.matchId === match.id
              }
              isRejecting={
                rejectMutation.isPending &&
                rejectMutation.variables?.matchId === match.id
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
