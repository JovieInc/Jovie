'use client';

/**
 * AppleMusicSyncBanner - Shows Apple Music match suggestions requiring action.
 *
 * Only renders for actionable states:
 * - Discovery in progress (scanning ISRCs)
 * - Suggested match awaiting confirmation
 * - No match found
 *
 * Confirmed/auto-confirmed matches are NOT shown here — the header pill
 * (DspConnectionPill) already communicates the connected state.
 */

import { Button } from '@jovie/ui';
import { useEffect, useMemo } from 'react';

import { Icon } from '@/components/atoms/Icon';
import { DspProviderIcon } from '@/components/dashboard/atoms/DspProviderIcon';
import type { ReleaseViewModel } from '@/lib/discography/types';
import {
  useConfirmDspMatchMutation,
  useRejectDspMatchMutation,
} from '@/lib/queries/useDspEnrichmentMutations';
import {
  type DspMatch,
  useDspMatchesQuery,
} from '@/lib/queries/useDspMatchesQuery';
import { cn } from '@/lib/utils';

interface AppleMusicSyncBannerProps {
  readonly profileId: string;
  readonly spotifyConnected: boolean;
  readonly releases: ReleaseViewModel[];
  readonly className?: string;
  readonly onMatchStatusChange?: (
    connected: boolean,
    artistName: string | null
  ) => void;
}

type SyncState = 'hidden' | 'loading' | 'suggested' | 'no_match';

function determineSyncState(
  spotifyConnected: boolean,
  releasesCount: number,
  isLoading: boolean,
  appleMusicMatch: DspMatch | null,
  withAppleMusic: number
): SyncState {
  if (!spotifyConnected || releasesCount === 0) return 'hidden';
  if (isLoading) return 'loading';
  if (!appleMusicMatch) {
    return withAppleMusic > 0 ? 'hidden' : 'no_match';
  }
  if (appleMusicMatch.status === 'suggested') return 'suggested';
  // Confirmed/auto-confirmed/rejected: no banner needed (header pill shows status)
  return 'hidden';
}

export function AppleMusicSyncBanner({
  profileId,
  spotifyConnected,
  releases,
  className,
  onMatchStatusChange,
}: AppleMusicSyncBannerProps) {
  const { data: matches = [] as DspMatch[], isLoading } = useDspMatchesQuery({
    profileId,
    enabled: spotifyConnected && !!profileId,
  });

  const confirmMutation = useConfirmDspMatchMutation();
  const rejectMutation = useRejectDspMatchMutation();

  // Find the Apple Music match (best one by confidence)
  const appleMusicMatch = useMemo((): DspMatch | null => {
    const amMatches = matches
      .filter((m: DspMatch) => m.providerId === 'apple_music')
      .sort(
        (a: DspMatch, b: DspMatch) => b.confidenceScore - a.confidenceScore
      );
    return amMatches[0] ?? null;
  }, [matches]);

  // Calculate Apple Music link coverage (used only for determineSyncState)
  const withAppleMusic = useMemo(() => {
    return releases.filter(r =>
      r.providers.some(p => p.key === 'apple_music' && p.url)
    ).length;
  }, [releases]);

  // Notify parent when match status changes so header pill stays in sync
  useEffect(() => {
    if (!onMatchStatusChange || !appleMusicMatch) return;
    const isConfirmed =
      appleMusicMatch.status === 'confirmed' ||
      appleMusicMatch.status === 'auto_confirmed';
    if (isConfirmed) {
      onMatchStatusChange(true, appleMusicMatch.externalArtistName);
    }
  }, [appleMusicMatch, onMatchStatusChange]);

  const syncState: SyncState = useMemo(
    () =>
      determineSyncState(
        spotifyConnected,
        releases.length,
        isLoading,
        appleMusicMatch,
        withAppleMusic
      ),
    [
      spotifyConnected,
      releases.length,
      isLoading,
      appleMusicMatch,
      withAppleMusic,
    ]
  );

  if (syncState === 'hidden') return null;

  if (syncState === 'loading') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-[#FA243C]/20 bg-[#FA243C]/5 px-4 py-3',
          className
        )}
      >
        <div className='flex h-8 w-8 items-center justify-center rounded-full bg-[#FA243C]/10'>
          <Icon
            name='Loader2'
            className='h-4 w-4 text-[#FA243C] animate-spin'
            aria-hidden='true'
          />
        </div>
        <p className='text-sm text-secondary-token'>Checking Apple Music...</p>
      </div>
    );
  }

  if (syncState === 'no_match') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-subtle bg-surface-1 px-4 py-3',
          className
        )}
      >
        <div className='flex h-8 w-8 items-center justify-center rounded-full bg-surface-2'>
          <DspProviderIcon provider='apple_music' size='md' />
        </div>
        <p className='text-sm text-secondary-token'>
          No matching Apple Music artist found
        </p>
      </div>
    );
  }

  // Suggested match — the only actionable banner state
  const match = appleMusicMatch!;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-[#FA243C]/20 bg-[#FA243C]/5 px-4 py-3',
        className
      )}
    >
      <div className='flex h-8 w-8 items-center justify-center rounded-full bg-[#FA243C]/10 shrink-0'>
        <DspProviderIcon provider='apple_music' size='md' />
      </div>

      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-2'>
          <span className='min-w-0 truncate text-sm font-medium text-primary-token'>
            {match.externalArtistName}
          </span>
          {match.externalArtistUrl && (
            <a
              href={match.externalArtistUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='shrink-0 text-tertiary-token transition-colors hover:text-secondary-token'
              title='View on Apple Music'
            >
              <Icon name='ExternalLink' className='h-3 w-3' />
            </a>
          )}
        </div>
        <p className='mt-0.5 text-xs text-secondary-token'>
          Confirm to link your Apple Music releases.
        </p>
      </div>

      <div className='flex items-center gap-2 shrink-0'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() =>
            rejectMutation.mutate({ matchId: match.id, profileId })
          }
          disabled={rejectMutation.isPending || confirmMutation.isPending}
          className='text-xs'
        >
          {rejectMutation.isPending &&
          rejectMutation.variables?.matchId === match.id
            ? 'Dismissing...'
            : 'Dismiss'}
        </Button>
        <Button
          variant='primary'
          size='sm'
          onClick={() =>
            confirmMutation.mutate({ matchId: match.id, profileId })
          }
          disabled={confirmMutation.isPending || rejectMutation.isPending}
          className='text-xs bg-[#FA243C] hover:bg-[#FA243C]/90'
        >
          {confirmMutation.isPending &&
          confirmMutation.variables?.matchId === match.id ? (
            <>
              <Icon
                name='Loader2'
                className='mr-1 h-3 w-3 animate-spin'
                aria-hidden='true'
              />
              Confirming...
            </>
          ) : (
            'Confirm'
          )}
        </Button>
      </div>
    </div>
  );
}
