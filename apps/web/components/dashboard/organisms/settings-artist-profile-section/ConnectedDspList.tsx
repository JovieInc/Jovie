'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Music,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  connectAppleMusicArtist,
  connectSpotifyArtist,
} from '@/app/app/(shell)/dashboard/releases/actions';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { DspConnectionPill } from '@/components/dashboard/atoms/DspConnectionPill';
import { ArtistSearchCommandPalette } from '@/components/organisms/artist-search-palette';
import type { DspProviderId } from '@/lib/dsp-enrichment/types';
import { queryKeys } from '@/lib/queries/keys';
import {
  useConfirmDspMatchMutation,
  useRejectDspMatchMutation,
  useTriggerDiscoveryMutation,
} from '@/lib/queries/useDspEnrichmentMutations';
import {
  type DspMatch,
  useDspMatchesQuery,
} from '@/lib/queries/useDspMatchesQuery';

const DSP_DISPLAY: Record<DspProviderId, { label: string; color: string }> = {
  spotify: { label: 'Spotify', color: 'text-[#1DB954]' },
  apple_music: { label: 'Apple Music', color: 'text-[#FA243C]' },
  youtube_music: { label: 'YouTube Music', color: 'text-[#FF0000]' },
  deezer: { label: 'Deezer', color: 'text-[#A238FF]' },
  tidal: { label: 'Tidal', color: 'text-primary-token' },
  soundcloud: { label: 'SoundCloud', color: 'text-[#FF5500]' },
  amazon_music: { label: 'Amazon Music', color: 'text-[#25D1DA]' },
  musicbrainz: { label: 'MusicBrainz', color: 'text-[#BA478F]' },
};

function getConfidenceLabel(score: number): {
  text: string;
  className: string;
} {
  if (score >= 0.8)
    return {
      text: 'Very High',
      className: 'text-green-600 dark:text-green-400',
    };
  if (score >= 0.6)
    return {
      text: 'High',
      className: 'text-emerald-600 dark:text-emerald-400',
    };
  if (score >= 0.4)
    return { text: 'Medium', className: 'text-amber-600 dark:text-amber-400' };
  return { text: 'Low', className: 'text-red-600 dark:text-red-400' };
}

function DspMatchRow({
  match,
  profileId,
}: Readonly<{
  match: DspMatch;
  profileId: string;
}>) {
  const display = DSP_DISPLAY[match.providerId] ?? {
    label: match.providerId,
    color: 'text-primary-token',
  };
  const isConnected =
    match.status === 'confirmed' || match.status === 'auto_confirmed';
  const isSuggested = match.status === 'suggested';
  const confidenceLabel = getConfidenceLabel(match.confidenceScore);

  const { mutate: confirmMatch, isPending: isConfirming } =
    useConfirmDspMatchMutation();
  const { mutate: rejectMatch, isPending: isRejecting } =
    useRejectDspMatchMutation();

  const handleConfirm = () => {
    confirmMatch(
      { matchId: match.id, profileId },
      {
        onSuccess: () => toast.success(`${display.label} profile connected`),
        onError: err =>
          toast.error(err.message || `Failed to connect ${display.label}`),
      }
    );
  };

  const handleReject = () => {
    rejectMatch(
      { matchId: match.id, profileId },
      {
        onSuccess: () => toast.success(`${display.label} suggestion dismissed`),
        onError: err =>
          toast.error(err.message || `Failed to dismiss ${display.label}`),
      }
    );
  };

  return (
    <div className='flex items-center justify-between gap-3 py-3 border-b border-subtle last:border-b-0'>
      <div className='flex items-center gap-3 min-w-0'>
        <div className='flex-shrink-0'>
          <Music className={`h-5 w-5 ${display.color}`} />
        </div>
        <div className='min-w-0'>
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium text-primary-token truncate'>
              {display.label}
            </span>
            {isConnected && (
              <CheckCircle2 className='h-3.5 w-3.5 text-green-500 flex-shrink-0' />
            )}
          </div>
          <p className='text-xs text-secondary-token truncate'>
            {match.externalArtistName}
          </p>
          {isSuggested && (
            <p className='text-xs mt-0.5'>
              <span className='text-secondary-token'>Confidence: </span>
              <span className={confidenceLabel.className}>
                {confidenceLabel.text} (
                {Math.round(match.confidenceScore * 100)}%)
              </span>
            </p>
          )}
        </div>
      </div>

      <div className='flex items-center gap-2 flex-shrink-0'>
        {isConnected && match.externalArtistUrl && (
          <a
            href={match.externalArtistUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='text-secondary-token hover:text-primary-token transition-colors'
            aria-label={`Open ${display.label} profile`}
          >
            <ExternalLink className='h-4 w-4' />
          </a>
        )}

        {isSuggested && (
          <>
            <button
              type='button'
              onClick={handleConfirm}
              disabled={isConfirming || isRejecting}
              className='inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors'
            >
              {isConfirming ? (
                <Loader2 className='h-3 w-3 animate-spin' />
              ) : (
                <CheckCircle2 className='h-3 w-3' />
              )}
              Connect
            </button>
            <button
              type='button'
              onClick={handleReject}
              disabled={isConfirming || isRejecting}
              className='inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md text-secondary-token hover:text-primary-token hover:bg-surface-2 disabled:opacity-50 transition-colors'
            >
              {isRejecting ? (
                <Loader2 className='h-3 w-3 animate-spin' />
              ) : (
                <XCircle className='h-3 w-3' />
              )}
              Dismiss
            </button>
          </>
        )}

        {isConnected && (
          <span className='text-xs text-green-600 dark:text-green-400 font-medium'>
            Connected
          </span>
        )}
      </div>
    </div>
  );
}

interface ConnectedDspListProps {
  readonly profileId: string;
  readonly spotifyId: string;
}

export function ConnectedDspList({
  profileId,
  spotifyId,
}: ConnectedDspListProps) {
  const queryClient = useQueryClient();
  const {
    data: matches,
    isLoading,
    error,
  } = useDspMatchesQuery({
    profileId,
    status: 'all',
    enabled: !!profileId,
  });

  const { mutate: triggerDiscovery, isPending: isDiscovering } =
    useTriggerDiscoveryMutation();
  const { mutate: rejectMatch } = useRejectDspMatchMutation();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteProvider, setPaletteProvider] = useState<
    'spotify' | 'apple_music'
  >('apple_music');

  const handleDiscover = () => {
    if (!spotifyId) {
      toast.error('A Spotify ID is required to discover DSP profiles');
      return;
    }

    triggerDiscovery(
      {
        profileId,
        spotifyArtistId: spotifyId,
      },
      {
        onSuccess: () =>
          toast.success('Discovery started — new matches will appear shortly'),
        onError: err => toast.error(err.message || 'Failed to start discovery'),
      }
    );
  };

  const handleDisconnect = useCallback(
    (match: DspMatch | undefined) => {
      if (!match) return;
      const label =
        DSP_DISPLAY[match.providerId as DspProviderId]?.label ??
        match.providerId;
      rejectMatch(
        { matchId: match.id, profileId, reason: 'user_disconnected' },
        {
          onSuccess: () => toast.success(`${label} disconnected`),
          onError: err =>
            toast.error(err.message || `Failed to disconnect ${label}`),
        }
      );
    },
    [profileId, rejectMatch]
  );

  const handleSyncNow = useCallback(
    (provider: 'spotify' | 'apple_music') => {
      if (!spotifyId) {
        toast.error('A Spotify ID is required to sync DSP profiles');
        return;
      }
      const label = DSP_DISPLAY[provider as DspProviderId]?.label ?? provider;
      triggerDiscovery(
        {
          profileId,
          spotifyArtistId: spotifyId,
          targetProviders: [provider],
        },
        {
          onSuccess: () => toast.success(`${label} sync started`),
          onError: err => toast.error(err.message || `Failed to sync ${label}`),
        }
      );
    },
    [profileId, spotifyId, triggerDiscovery]
  );

  const handleOpenPalette = useCallback(
    (provider: 'spotify' | 'apple_music') => {
      setPaletteProvider(provider);
      setPaletteOpen(true);
    },
    []
  );

  const handlePaletteSelect = useCallback(
    async (artist: {
      id: string;
      name: string;
      url: string;
      imageUrl?: string;
    }) => {
      try {
        if (paletteProvider === 'spotify') {
          const result = await connectSpotifyArtist({
            spotifyArtistId: artist.id,
            spotifyArtistUrl: artist.url,
            artistName: artist.name,
          });
          if (result.success) {
            toast.success(result.message);
          } else {
            toast.error(result.message || 'Failed to connect Spotify');
          }
        } else {
          const result = await connectAppleMusicArtist({
            externalArtistId: artist.id,
            externalArtistName: artist.name,
            externalArtistUrl: artist.url,
            externalArtistImageUrl: artist.imageUrl,
          });
          if (result.success) {
            toast.success(result.message);
          } else {
            toast.error(result.message || 'Failed to connect Apple Music');
          }
        }

        await queryClient.invalidateQueries({
          queryKey: queryKeys.dspEnrichment.matches(profileId),
        });
      } catch (err) {
        const providerName =
          paletteProvider === 'spotify' ? 'Spotify' : 'Apple Music';
        toast.error(
          err instanceof Error
            ? err.message
            : `Failed to connect ${providerName}`
        );
      }
    },
    [paletteProvider, profileId, queryClient]
  );

  const confirmed =
    matches?.filter(
      m => m.status === 'confirmed' || m.status === 'auto_confirmed'
    ) ?? [];
  const suggested = matches?.filter(m => m.status === 'suggested') ?? [];

  // Determine connection status for Spotify and Apple Music
  const spotifyMatch = useMemo(
    () =>
      matches?.find(
        m =>
          m.providerId === 'spotify' &&
          (m.status === 'confirmed' || m.status === 'auto_confirmed')
      ),
    [matches]
  );
  const appleMusicMatch = useMemo(
    () =>
      matches?.find(
        m =>
          m.providerId === 'apple_music' &&
          (m.status === 'confirmed' || m.status === 'auto_confirmed')
      ),
    [matches]
  );

  // Filter out spotify/apple_music from the general confirmed/suggested lists
  // since they now have their own prominent section
  const otherConfirmed = confirmed.filter(
    m => m.providerId !== 'spotify' && m.providerId !== 'apple_music'
  );
  const otherSuggested = suggested.filter(
    m => m.providerId !== 'spotify' && m.providerId !== 'apple_music'
  );

  if (isLoading) {
    return (
      <DashboardCard variant='settings'>
        <div className='flex items-center justify-center py-8'>
          <Loader2 className='h-5 w-5 animate-spin text-secondary-token' />
          <span className='ml-2 text-sm text-secondary-token'>
            Loading DSP connections...
          </span>
        </div>
      </DashboardCard>
    );
  }

  if (error) {
    return (
      <DashboardCard variant='settings'>
        <div className='text-center py-6'>
          <p className='text-sm text-secondary-token'>
            Failed to load DSP connections. Please try again.
          </p>
        </div>
      </DashboardCard>
    );
  }

  const hasOtherMatches =
    otherConfirmed.length > 0 || otherSuggested.length > 0;

  return (
    <DashboardCard variant='settings'>
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <p className='text-sm text-secondary-token'>
            Link your profiles on streaming platforms.
          </p>
          {spotifyId && (
            <button
              type='button'
              onClick={handleDiscover}
              disabled={isDiscovering}
              className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-subtle bg-surface-1 text-primary-token hover:bg-surface-2 disabled:opacity-50 transition-colors'
            >
              {isDiscovering ? (
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
              ) : (
                <RefreshCw className='h-3.5 w-3.5' />
              )}
              Discover
            </button>
          )}
        </div>

        {/* Primary DSP connection pills */}
        <div className='flex flex-wrap items-center gap-2'>
          <DspConnectionPill
            provider='spotify'
            connected={!!spotifyId || !!spotifyMatch}
            artistName={spotifyMatch?.externalArtistName}
            onClick={
              !spotifyId && !spotifyMatch
                ? () => handleOpenPalette('spotify')
                : undefined
            }
            onSyncNow={spotifyId ? () => handleSyncNow('spotify') : undefined}
            onDisconnect={
              spotifyMatch ? () => handleDisconnect(spotifyMatch) : undefined
            }
          />
          <DspConnectionPill
            provider='apple_music'
            connected={!!appleMusicMatch}
            artistName={appleMusicMatch?.externalArtistName}
            onClick={
              appleMusicMatch
                ? undefined
                : () => handleOpenPalette('apple_music')
            }
            onSyncNow={
              appleMusicMatch ? () => handleSyncNow('apple_music') : undefined
            }
            onDisconnect={
              appleMusicMatch
                ? () => handleDisconnect(appleMusicMatch)
                : undefined
            }
          />
        </div>

        {/* Other confirmed and suggested matches */}
        {hasOtherMatches && (
          <div>
            {otherConfirmed.length > 0 && (
              <div>
                {otherConfirmed.map(match => (
                  <DspMatchRow
                    key={match.id}
                    match={match}
                    profileId={profileId}
                  />
                ))}
              </div>
            )}

            {otherSuggested.length > 0 && (
              <div className={otherConfirmed.length > 0 ? 'mt-4' : ''}>
                <p className='text-xs font-medium text-secondary-token uppercase tracking-wide mb-2'>
                  Suggested Matches
                </p>
                {otherSuggested.map(match => (
                  <DspMatchRow
                    key={match.id}
                    match={match}
                    profileId={profileId}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {!hasOtherMatches &&
          !spotifyId &&
          !spotifyMatch &&
          !appleMusicMatch && (
            <div className='text-center py-4'>
              <Music className='h-8 w-8 text-secondary-token/50 mx-auto mb-2' />
              <p className='text-sm text-secondary-token'>
                Click a pill above to connect your streaming profiles.
              </p>
            </div>
          )}
      </div>

      {/* Artist search command palette */}
      <ArtistSearchCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        provider={paletteProvider}
        onArtistSelect={handlePaletteSelect}
      />
    </DashboardCard>
  );
}
