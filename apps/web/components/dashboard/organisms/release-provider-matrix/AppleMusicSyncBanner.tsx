'use client';

/**
 * AppleMusicSyncBanner - Shows Apple Music sync status and match suggestions
 *
 * Displays contextual banners for:
 * - Discovery in progress (scanning ISRCs)
 * - Suggested match awaiting confirmation
 * - Auto-confirmed match with link coverage stats
 * - Confirmed match with link coverage stats
 * - No match found
 */

import { Button } from '@jovie/ui';
import Image from 'next/image';
import { useMemo } from 'react';

import { Icon } from '@/components/atoms/Icon';
import { ConfidenceBadge } from '@/components/dashboard/atoms/ConfidenceBadge';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/components/dashboard/atoms/DspProviderIcon';
import { MatchStatusBadge } from '@/components/dashboard/atoms/MatchStatusBadge';
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
import { isExternalDspImage } from '@/lib/utils/dsp-images';

function MatchDescription({
  isSuggested,
  syncState,
  match,
  linkCoverage,
}: {
  readonly isSuggested: boolean;
  readonly syncState: SyncState;
  readonly match: DspMatch;
  readonly linkCoverage: { total: number; withAppleMusic: number };
}) {
  const isrcLabel = match.matchingIsrcCount === 1 ? 'match' : 'matches';

  if (isSuggested) {
    return (
      <>
        Found via {match.matchingIsrcCount} ISRC {isrcLabel}. Confirm to link
        your Apple Music releases.
      </>
    );
  }

  return (
    <>
      {syncState === 'auto_confirmed' ? 'Auto-linked' : 'Linked'} via{' '}
      {match.matchingIsrcCount} ISRC {isrcLabel}
      {linkCoverage.total > 0 && (
        <span className='text-tertiary-token'>
          {' '}
          &middot; {linkCoverage.withAppleMusic}/{linkCoverage.total} releases
          with Apple Music links
        </span>
      )}
    </>
  );
}

interface AppleMusicSyncBannerProps {
  readonly profileId: string;
  readonly spotifyConnected: boolean;
  readonly releases: ReleaseViewModel[];
  readonly className?: string;
}

type SyncState =
  | 'hidden'
  | 'loading'
  | 'suggested'
  | 'auto_confirmed'
  | 'confirmed'
  | 'no_match';

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
  if (appleMusicMatch.status === 'auto_confirmed') return 'auto_confirmed';
  if (appleMusicMatch.status === 'confirmed') return 'confirmed';
  if (appleMusicMatch.status === 'rejected') return 'hidden';
  return 'hidden';
}

export function AppleMusicSyncBanner({
  profileId,
  spotifyConnected,
  releases,
  className,
}: AppleMusicSyncBannerProps) {
  // Fetch Apple Music matches for this profile
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

  // Calculate Apple Music link coverage
  const linkCoverage = useMemo(() => {
    if (releases.length === 0) return { total: 0, withAppleMusic: 0 };
    const withAppleMusic = releases.filter(r =>
      r.providers.some(p => p.key === 'apple_music' && p.url)
    ).length;
    return { total: releases.length, withAppleMusic };
  }, [releases]);

  // Determine sync state
  const syncState: SyncState = useMemo(
    () =>
      determineSyncState(
        spotifyConnected,
        releases.length,
        isLoading,
        appleMusicMatch,
        linkCoverage.withAppleMusic
      ),
    [
      spotifyConnected,
      releases.length,
      isLoading,
      appleMusicMatch,
      linkCoverage.withAppleMusic,
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
        <div className='flex-1 min-w-0'>
          <p className='text-sm font-medium text-primary-token'>
            Checking Apple Music...
          </p>
          <p className='text-xs text-secondary-token'>
            Scanning your catalog for Apple Music matches
          </p>
        </div>
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
        <div className='flex-1 min-w-0'>
          <p className='text-sm font-medium text-primary-token'>
            Apple Music artist not found
          </p>
          <p className='text-xs text-secondary-token'>
            No matching Apple Music profile was discovered via ISRC matching.
            Links may still be generated for individual releases.
          </p>
        </div>
        <div className='shrink-0 text-xs text-tertiary-token'>
          {linkCoverage.withAppleMusic}/{linkCoverage.total} releases linked
        </div>
      </div>
    );
  }

  // Shared state for suggested / confirmed / auto_confirmed
  const match = appleMusicMatch!;
  const isConfirmed =
    syncState === 'confirmed' || syncState === 'auto_confirmed';
  const isSuggested = syncState === 'suggested';

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3',
        isSuggested
          ? 'border-[#FA243C]/30 bg-[#FA243C]/5'
          : 'border-[#FA243C]/20 bg-[#FA243C]/[0.03]',
        className
      )}
    >
      <div className='flex items-start gap-3'>
        {/* Artist image or provider icon */}
        {match.externalArtistImageUrl ? (
          <div
            className={cn(
              'relative h-9 w-9 shrink-0 overflow-hidden rounded-full',
              isSuggested ? 'bg-[#FA243C]/10' : 'bg-green-500/10'
            )}
          >
            <Image
              src={match.externalArtistImageUrl}
              alt={match.externalArtistName}
              fill
              sizes='36px'
              className='object-cover'
              unoptimized={isExternalDspImage(match.externalArtistImageUrl)}
            />
          </div>
        ) : (
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full shrink-0',
              isSuggested ? 'bg-[#FA243C]/10' : 'bg-green-500/10'
            )}
          >
            <DspProviderIcon provider='apple_music' size='md' />
          </div>
        )}

        {/* Match info */}
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2'>
            <DspProviderIcon
              provider='apple_music'
              size='sm'
              className='shrink-0'
            />
            <span className='min-w-0 truncate text-sm font-medium text-primary-token'>
              {match.externalArtistName}
            </span>
            {match.externalArtistUrl && (
              <a
                href={match.externalArtistUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='shrink-0 text-tertiary-token transition-colors hover:text-secondary-token'
                title={`View on ${PROVIDER_LABELS.apple_music}`}
              >
                <Icon name='ExternalLink' className='h-3 w-3' />
              </a>
            )}
            <MatchStatusBadge status={match.status} size='sm' />
            <ConfidenceBadge score={match.confidenceScore} size='sm' />
          </div>

          <p className='mt-0.5 text-xs text-secondary-token'>
            <MatchDescription
              isSuggested={isSuggested}
              syncState={syncState}
              match={match}
              linkCoverage={linkCoverage}
            />
          </p>
        </div>

        {/* Actions */}
        <div className='flex items-center gap-2 shrink-0'>
          {isSuggested && (
            <>
              <Button
                variant='ghost'
                size='sm'
                onClick={() =>
                  rejectMutation.mutate({
                    matchId: match.id,
                    profileId,
                  })
                }
                disabled={rejectMutation.isPending || confirmMutation.isPending}
                className='text-xs'
              >
                {rejectMutation.isPending &&
                rejectMutation.variables?.matchId === match.id
                  ? 'Rejecting...'
                  : 'Dismiss'}
              </Button>
              <Button
                variant='primary'
                size='sm'
                onClick={() =>
                  confirmMutation.mutate({
                    matchId: match.id,
                    profileId,
                  })
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
                  'Confirm Match'
                )}
              </Button>
            </>
          )}
          {isConfirmed && linkCoverage.total > 0 && (
            <div className='text-right'>
              <div className='text-sm font-medium text-primary-token'>
                {linkCoverage.withAppleMusic}/{linkCoverage.total}
              </div>
              <div className='text-[10px] text-tertiary-token'>
                releases linked
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
