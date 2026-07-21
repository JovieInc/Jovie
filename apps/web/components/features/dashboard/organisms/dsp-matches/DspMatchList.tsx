'use client';

import { useCallback, useMemo, useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { EmptyState } from '@/components/molecules/EmptyState';
import { APP_ROUTES } from '@/constants/routes';
import { DspMatchCard } from '@/features/dashboard/molecules/DspMatchCard';
import type { DspMatchStatus } from '@/lib/dsp-enrichment/types';
import {
  countMatchesByStatus,
  useConfirmDspMatchMutation,
  useDspMatchesQuery,
  useRejectDspMatchMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

export interface DspMatchListProps {
  readonly profileId: string;
  readonly className?: string;
}

type FilterStatus = DspMatchStatus | 'all';

const STATUS_FILTERS: Array<{ value: FilterStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'suggested', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'auto_confirmed', label: 'Auto Confirmed' },
  { value: 'rejected', label: 'Rejected' },
];

const DSP_MATCH_EMPTY: Record<
  FilterStatus,
  { title: string; description: string; icon: string }
> = {
  all: {
    title: 'No Platform Matches Found',
    description:
      "We haven't found any streaming platform matches for your profile yet. Check presence while we keep looking.",
    icon: 'Music',
  },
  suggested: {
    title: 'No Pending Matches',
    description:
      'All suggested matches have been reviewed. New matches will appear here automatically.',
    icon: 'CheckCircle',
  },
  confirmed: {
    title: 'No Confirmed Matches',
    description: 'Matches you confirm will appear here.',
    icon: 'CheckCircle',
  },
  auto_confirmed: {
    title: 'No Auto-Confirmed Matches',
    description: 'Automatically confirmed matches will appear here.',
    icon: 'Sparkles',
  },
  rejected: {
    title: 'No Rejected Matches',
    description: 'Matches you reject will appear here.',
    icon: 'XCircle',
  },
};

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
      <ContentSurfaceCard
        className={cn('border-destructive/15 bg-destructive/5 p-4', className)}
      >
        <div className='flex items-center gap-2 text-destructive'>
          <Icon name='AlertCircle' className='h-4 w-4' />
          <span className='text-app font-caption'>Failed to load matches</span>
        </div>
        <p className='mt-1 text-xs text-red-600/80 dark:text-red-400/80'>
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </ContentSurfaceCard>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Filter Tabs */}
      <div className='overflow-x-auto'>
        <AppSegmentControl
          value={statusFilter}
          onValueChange={setStatusFilter}
          size='sm'
          options={STATUS_FILTERS.map(filter => {
            const count =
              filter.value === 'all'
                ? allMatches.length
                : (statusCounts[filter.value] ?? 0);
            return {
              value: filter.value,
              label: (
                <span className='inline-flex items-center gap-1.5'>
                  <span>{filter.label}</span>
                  {count > 0 && (
                    <span className='rounded-md border border-subtle bg-surface-0 px-1.5 py-0.5 text-3xs text-secondary-token tabular-nums'>
                      {count}
                    </span>
                  )}
                </span>
              ),
            };
          })}
          aria-label='Filter DSP Matches By Status'
          className='min-w-max'
          triggerClassName='flex-none'
        />
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className='space-y-3'>
          {[1, 2, 3].map(i => (
            <ContentSurfaceCard key={i} className='p-4'>
              <div className='flex items-center gap-3'>
                <div className='h-10 w-10 rounded-lg skeleton' />
                <div className='flex-1 space-y-2'>
                  <div className='h-4 w-32 rounded skeleton' />
                  <div className='h-3 w-24 rounded skeleton' />
                </div>
                <div className='space-y-1'>
                  <div className='h-5 w-16 rounded-md skeleton' />
                  <div className='h-5 w-12 rounded-md skeleton' />
                </div>
              </div>
            </ContentSurfaceCard>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && displayMatches.length === 0 && (
        <ContentSurfaceCard className='flex flex-col items-center justify-center px-3 py-2 text-center'>
          <EmptyState
            icon={
              <Icon
                name={DSP_MATCH_EMPTY[statusFilter].icon}
                className='h-5 w-5'
              />
            }
            heading={DSP_MATCH_EMPTY[statusFilter].title}
            description={DSP_MATCH_EMPTY[statusFilter].description}
            action={
              statusFilter === 'all'
                ? {
                    label: 'View Presence',
                    href: APP_ROUTES.PRESENCE,
                  }
                : {
                    label: 'Show All Matches',
                    onClick: () => setStatusFilter('all'),
                  }
            }
            secondaryAction={
              statusFilter === 'all'
                ? undefined
                : {
                    label: 'View Presence',
                    href: APP_ROUTES.PRESENCE,
                  }
            }
            className='py-6'
          />
        </ContentSurfaceCard>
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
