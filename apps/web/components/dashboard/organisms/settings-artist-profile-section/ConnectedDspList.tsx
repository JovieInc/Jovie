'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Music } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  connectAppleMusicArtist,
  connectSpotifyArtist,
} from '@/app/app/(shell)/dashboard/releases/actions';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { DspConnectionPill } from '@/components/dashboard/atoms/DspConnectionPill';
import { ArtistSearchCommandPalette } from '@/components/organisms/artist-search-palette';
import { queryKeys } from '@/lib/queries/keys';
import {
  useRejectDspMatchMutation,
  useTriggerDiscoveryMutation,
} from '@/lib/queries/useDspEnrichmentMutations';
import {
  type DspMatch,
  useDspMatchesQuery,
} from '@/lib/queries/useDspMatchesQuery';

const DSP_DISPLAY: Record<
  'spotify' | 'apple_music',
  { label: string; color: string }
> = {
  spotify: { label: 'Spotify', color: 'text-[#1DB954]' },
  apple_music: { label: 'Apple Music', color: 'text-[#FA243C]' },
};

interface ConnectedDspListProps {
  readonly profileId: string;
  readonly spotifyId: string | null;
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

  const { mutate: triggerDiscovery } = useTriggerDiscoveryMutation();
  const { mutate: rejectMatch } = useRejectDspMatchMutation();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteProvider, setPaletteProvider] = useState<
    'spotify' | 'apple_music'
  >('apple_music');

  const handleDisconnect = useCallback(
    (match: DspMatch | undefined) => {
      if (!match) return;
      const label =
        DSP_DISPLAY[match.providerId as keyof typeof DSP_DISPLAY]?.label ??
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
      const label = DSP_DISPLAY[provider]?.label ?? provider;
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

  return (
    <DashboardCard variant='settings'>
      <div className='space-y-4'>
        <p className='text-sm text-secondary-token'>
          Connect your Spotify and Apple Music artist profiles.
        </p>

        {/* Spotify & Apple Music connection pills */}
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
              appleMusicMatch && spotifyId
                ? () => handleSyncNow('apple_music')
                : undefined
            }
            onDisconnect={
              appleMusicMatch
                ? () => handleDisconnect(appleMusicMatch)
                : undefined
            }
          />
        </div>

        {!spotifyId && !spotifyMatch && !appleMusicMatch && (
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
