'use client';

/**
 * AppleMusicSyncBanner - Shows Apple Music match suggestions requiring action.
 *
 * Only renders for actionable states:
 * - Suggested match awaiting confirmation
 * - No match found
 *
 * Loading/confirmed/auto-confirmed matches are NOT shown here — the header pill
 * (DspConnectionPill) already communicates the connected state, and we avoid
 * flashing a loading banner on every page visit.
 */

import { useEffect, useMemo } from 'react';

import { Icon } from '@/components/atoms/Icon';
import {
  DrawerButton,
  DrawerInlineIconButton,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { DspProviderIcon } from '@/features/dashboard/atoms/DspProviderIcon';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import type { ReleaseViewModel } from '@/lib/discography/types';
import {
  type DspMatch,
  useConfirmDspMatchMutation,
  useDspMatchesQuery,
  useRejectDspMatchMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

interface AppleMusicSyncBannerProps {
  readonly profileId: string;
  readonly spotifyConnected: boolean;
  readonly releases: ReleaseViewModel[];
  readonly className?: string;
  readonly compact?: boolean;
  readonly onMatchStatusChange?: (
    connected: boolean,
    artistName: string | null
  ) => void;
}

type SyncState = 'hidden' | 'suggested' | 'no_match';

function determineSyncState(
  spotifyConnected: boolean,
  releasesCount: number,
  isLoading: boolean,
  appleMusicMatch: DspMatch | null,
  withAppleMusic: number
): SyncState {
  if (!spotifyConnected || releasesCount === 0 || isLoading) return 'hidden';
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
  compact = false,
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

  if (compact) {
    if (syncState === 'no_match') {
      return (
        <div
          className={cn(
            'inline-flex h-7.5 items-center gap-2 rounded-md border border-[#FA243C]/18 bg-[#FA243C]/6 px-2.5 text-xs text-secondary-token',
            className
          )}
        >
          <DspProviderIcon provider='apple_music' size='sm' />
          <span>No Apple Music match</span>
        </div>
      );
    }

    const match = appleMusicMatch!;

    return (
      <div
        className={cn(
          'inline-flex h-7.5 items-center gap-2 rounded-md border border-[#FA243C]/18 bg-[#FA243C]/6 px-2 text-xs text-primary-token',
          className
        )}
      >
        <DspProviderIcon provider='apple_music' size='sm' />
        <span className='max-w-[160px] truncate text-secondary-token'>
          Match: {match.externalArtistName}
        </span>
        <DrawerButton
          tone='ghost'
          onClick={() =>
            rejectMutation.mutate({ matchId: match.id, profileId })
          }
          disabled={rejectMutation.isPending || confirmMutation.isPending}
          className='h-7 rounded-md px-2 text-2xs'
        >
          Dismiss
        </DrawerButton>
        <DrawerButton
          tone='primary'
          onClick={() =>
            confirmMutation.mutate({ matchId: match.id, profileId })
          }
          disabled={confirmMutation.isPending || rejectMutation.isPending}
          className='h-7 rounded-md border-[#FA243C] bg-[#FA243C] px-2 text-2xs hover:border-[#FA243C] hover:bg-[#FA243C]/90'
        >
          Confirm
        </DrawerButton>
      </div>
    );
  }

  if (syncState === 'no_match') {
    return (
      <DrawerSurfaceCard
        variant='card'
        className={cn(
          LINEAR_SURFACE.bannerCard,
          'flex items-center gap-3 px-4 py-3 text-secondary-token',
          className
        )}
      >
        <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FA243C]/8'>
          <DspProviderIcon provider='apple_music' size='md' />
        </div>
        <div className='min-w-0 flex-1'>
          <p className='text-app font-[510] text-primary-token'>
            No Apple Music match found
          </p>
          <p className='mt-0.5 text-2xs text-secondary-token'>
            We couldn&apos;t confidently match your artist yet.
          </p>
        </div>
      </DrawerSurfaceCard>
    );
  }

  // Suggested match — the only actionable banner state
  const match = appleMusicMatch!;
  const externalArtistUrl = match.externalArtistUrl ?? undefined;

  return (
    <DrawerSurfaceCard
      variant='card'
      className={cn(
        'flex items-center gap-3 rounded-[10px] border border-[#FA243C]/16 bg-[color-mix(in_oklab,#FA243C_4%,var(--linear-app-content-surface))] px-4 py-3',
        className
      )}
    >
      <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FA243C]/8'>
        <DspProviderIcon provider='apple_music' size='md' />
      </div>

      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-2'>
          <span className='min-w-0 truncate text-app font-[510] text-primary-token'>
            {match.externalArtistName}
          </span>
          {externalArtistUrl && (
            <DrawerInlineIconButton
              type='button'
              aria-label='View on Apple Music'
              onClick={() =>
                globalThis.open(
                  externalArtistUrl,
                  '_blank',
                  'noopener,noreferrer'
                )
              }
              className='p-0.5 text-tertiary-token'
            >
              <Icon name='ExternalLink' className='h-3 w-3' />
            </DrawerInlineIconButton>
          )}
        </div>
        <p className='mt-0.5 text-2xs text-secondary-token'>
          Confirm to link your Apple Music releases.
        </p>
      </div>

      <div className='flex shrink-0 items-center gap-1.5'>
        <DrawerButton
          tone='ghost'
          onClick={() =>
            rejectMutation.mutate({ matchId: match.id, profileId })
          }
          disabled={rejectMutation.isPending || confirmMutation.isPending}
          className='h-7 rounded-lg px-2.5 text-xs'
        >
          {rejectMutation.isPending &&
          rejectMutation.variables?.matchId === match.id
            ? 'Dismissing...'
            : 'Dismiss'}
        </DrawerButton>
        <DrawerButton
          tone='primary'
          onClick={() =>
            confirmMutation.mutate({ matchId: match.id, profileId })
          }
          disabled={confirmMutation.isPending || rejectMutation.isPending}
          className='h-7 rounded-lg border-[#FA243C] bg-[#FA243C] px-2.5 text-xs hover:border-[#FA243C] hover:bg-[#FA243C]/90'
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
        </DrawerButton>
      </div>
    </DrawerSurfaceCard>
  );
}
