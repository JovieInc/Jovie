'use client';

import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  PageToolbar,
  PageToolbarActionButton,
} from '@/components/organisms/table';
import { DrawerToggleButton } from '@/features/dashboard/atoms/DrawerToggleButton';
import { useTriggerDiscoveryMutation } from '@/lib/queries/useDspEnrichmentMutations';
import type { EnrichmentStatus } from '@/lib/queries/useDspEnrichmentStatusQuery';
import {
  getPhaseLabel,
  isEnrichmentInProgress,
} from '@/lib/queries/useDspEnrichmentStatusQuery';

interface DspPresenceSummaryProps {
  readonly confirmedCount: number;
  readonly suggestedCount: number;
  readonly profileId: string;
  readonly isAdmin?: boolean;
  readonly spotifyId?: string | null;
  readonly enrichmentStatus?: EnrichmentStatus;
  readonly onAddPlatform: () => void;
}

export function DspPresenceSummary({
  confirmedCount,
  suggestedCount,
  profileId,
  isAdmin = false,
  spotifyId,
  enrichmentStatus,
  onAddPlatform,
}: DspPresenceSummaryProps) {
  const { mutate: triggerDiscovery, isPending: isRefreshing } =
    useTriggerDiscoveryMutation();
  const isDiscovering = isEnrichmentInProgress(enrichmentStatus);
  let refreshTooltip: string;
  if (isDiscovering) {
    refreshTooltip = 'Discovery in progress...';
  } else if (spotifyId) {
    refreshTooltip = 'Re-scan streaming platforms';
  } else {
    refreshTooltip = 'Connect Spotify first to enable discovery';
  }

  function handleRefresh() {
    if (!spotifyId || !profileId) return;
    triggerDiscovery(
      { profileId, spotifyArtistId: spotifyId },
      {
        onSuccess: () => {
          toast.success('Discovery started, new profiles will appear shortly');
        },
        onError: () => {
          toast.error('Failed to trigger discovery');
        },
      }
    );
  }

  return (
    <PageToolbar
      start={
        <div className='flex min-w-0 items-center gap-2 text-2xs text-tertiary-token'>
          <span>
            {confirmedCount} matched platform
            {confirmedCount === 1 ? '' : 's'}
          </span>
          {suggestedCount > 0 && (
            <>
              <span className='text-quaternary-token'>&middot;</span>
              <span className='inline-flex items-center gap-1.5'>
                <span className='h-1.5 w-1.5 rounded-full bg-amber-500' />
                {suggestedCount} pending
              </span>
            </>
          )}
          {isDiscovering && enrichmentStatus && (
            <>
              <span className='text-quaternary-token'>&middot;</span>
              <span className='inline-flex items-center gap-1.5 text-blue-500'>
                <Loader2 className='h-3 w-3 animate-spin' />
                {getPhaseLabel(enrichmentStatus.overallPhase)}
              </span>
            </>
          )}
        </div>
      }
      end={
        <div className='flex items-center gap-1'>
          {isAdmin && (
            <PageToolbarActionButton
              label='Refresh'
              icon={
                isRefreshing || isDiscovering ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  <RefreshCw className='h-3.5 w-3.5' />
                )
              }
              onClick={handleRefresh}
              disabled={!spotifyId || isRefreshing || isDiscovering}
              iconOnly
              tooltipLabel={refreshTooltip}
            />
          )}
          <DrawerToggleButton
            chrome='page-toolbar'
            ariaLabel='Toggle presence details sidebar'
          />
          <PageToolbarActionButton
            label='Add Platform'
            icon={<Plus className='h-3.5 w-3.5' />}
            onClick={onAddPlatform}
            iconOnly
            tooltipLabel='Add platform'
          />
        </div>
      }
    />
  );
}
