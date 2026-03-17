'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Music } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  connectAppleMusicArtist,
  connectSpotifyArtist,
} from '@/app/app/(shell)/dashboard/releases/actions';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ArtistSearchCommandPalette } from '@/components/organisms/artist-search-palette';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';
import { DspConnectionPill } from '@/features/dashboard/atoms/DspConnectionPill';
import type { DspProviderId } from '@/lib/dsp-enrichment/types';
import {
  type DspMatch,
  queryKeys,
  useDspMatchesQuery,
  useRejectDspMatchMutation,
  useTriggerDiscoveryMutation,
} from '@/lib/queries';

type PrimaryDspProvider = 'spotify' | 'apple_music';

/** Non-primary DSP providers that can appear in the secondary section */
type NonPrimaryDspProvider =
  | 'youtube_music'
  | 'soundcloud'
  | 'tidal'
  | 'deezer'
  | 'amazon_music';

const NON_PRIMARY_PROVIDERS: NonPrimaryDspProvider[] = [
  'youtube_music',
  'soundcloud',
  'tidal',
  'deezer',
  'amazon_music',
];

const PROVIDER_LABELS: Record<DspProviderId, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube_music: 'YouTube Music',
  soundcloud: 'SoundCloud',
  tidal: 'Tidal',
  deezer: 'Deezer',
  amazon_music: 'Amazon Music',
  musicbrainz: 'MusicBrainz',
};

interface ArtistSelection {
  id: string;
  name: string;
  url: string;
  imageUrl?: string;
}

function isConfirmedMatch(match: DspMatch): boolean {
  return match.status === 'confirmed' || match.status === 'auto_confirmed';
}

function findConfirmedMatch(
  matches: DspMatch[] | undefined,
  providerId: DspProviderId
): DspMatch | undefined {
  return matches?.find(m => m.providerId === providerId && isConfirmedMatch(m));
}

async function connectProvider(
  provider: PrimaryDspProvider,
  artist: ArtistSelection
): Promise<{ success: boolean; message?: string }> {
  if (provider === 'spotify') {
    return connectSpotifyArtist({
      spotifyArtistId: artist.id,
      spotifyArtistUrl: artist.url,
      artistName: artist.name,
    });
  }
  return connectAppleMusicArtist({
    externalArtistId: artist.id,
    externalArtistName: artist.name,
    externalArtistUrl: artist.url,
    externalArtistImageUrl: artist.imageUrl,
  });
}

function getProviderLabel(provider: DspProviderId): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

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
  const { mutateAsync: rejectMatchAsync, isPending: isDisconnectPending } =
    useRejectDspMatchMutation();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteProvider, setPaletteProvider] =
    useState<PrimaryDspProvider>('apple_music');
  const [matchToDisconnect, setMatchToDisconnect] = useState<
    DspMatch | undefined
  >(undefined);

  const handleDisconnect = useCallback((match: DspMatch | undefined) => {
    if (!match) return;
    setMatchToDisconnect(match);
  }, []);

  const handleDisconnectConfirm = useCallback(async () => {
    if (!matchToDisconnect) return;
    const label = getProviderLabel(
      matchToDisconnect.providerId as DspProviderId
    );
    try {
      await rejectMatchAsync({
        matchId: matchToDisconnect.id,
        profileId,
        reason: 'user_disconnected',
      });
      toast.success(`${label} disconnected`);
    } catch (err: unknown) {
      console.error(`Failed to disconnect ${label}`, err);
      toast.error(`Failed to disconnect ${label}. Please try again.`);
    }
  }, [matchToDisconnect, profileId, rejectMatchAsync]);

  const handleDisconnectCancel = useCallback(
    (open: boolean) => {
      if (open) return;
      if (isDisconnectPending) return;
      setMatchToDisconnect(undefined);
    },
    [isDisconnectPending]
  );

  const handleSyncNow = useCallback(
    (provider: DspProviderId) => {
      if (!spotifyId) {
        toast.error('A Spotify ID is required to sync platform profiles');
        return;
      }
      const label = getProviderLabel(provider);
      triggerDiscovery(
        { profileId, spotifyArtistId: spotifyId, targetProviders: [provider] },
        {
          onSuccess: () => toast.success(`${label} sync started`),
          onError: err => {
            console.error(`Failed to sync ${label}`, err);
            toast.error(`Failed to sync ${label}. Please try again.`);
          },
        }
      );
    },
    [profileId, spotifyId, triggerDiscovery]
  );

  const handleOpenPalette = useCallback((provider: PrimaryDspProvider) => {
    setPaletteProvider(provider);
    setPaletteOpen(true);
  }, []);

  const handlePaletteSelect = useCallback(
    async (artist: ArtistSelection) => {
      try {
        const result = await connectProvider(paletteProvider, artist);
        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error(
            result.message ||
              `Failed to connect ${getProviderLabel(paletteProvider)}`
          );
        }

        await queryClient.invalidateQueries({
          queryKey: queryKeys.dspEnrichment.matches(profileId),
        });
      } catch (err) {
        console.error(
          `Failed to connect ${getProviderLabel(paletteProvider)}`,
          err
        );
        toast.error(
          `Failed to connect ${getProviderLabel(paletteProvider)}. Please try again.`
        );
      }
    },
    [paletteProvider, profileId, queryClient]
  );

  const spotifyMatch = useMemo(
    () => findConfirmedMatch(matches, 'spotify'),
    [matches]
  );
  const appleMusicMatch = useMemo(
    () => findConfirmedMatch(matches, 'apple_music'),
    [matches]
  );

  // Collect confirmed non-primary DSP matches
  const nonPrimaryMatches = useMemo(
    () =>
      NON_PRIMARY_PROVIDERS.map(provider => ({
        provider,
        match: findConfirmedMatch(matches, provider),
      })).filter(
        (
          entry
        ): entry is { provider: NonPrimaryDspProvider; match: DspMatch } =>
          !!entry.match
      ),
    [matches]
  );

  if (isLoading) {
    return (
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <ContentSectionHeader
          title='Streaming profiles'
          subtitle='Connect and sync your primary artist profiles across streaming platforms.'
          className='min-h-0 px-4 py-3'
        />
        <div className='px-4 py-3'>
          <ContentSurfaceCard className='flex items-center justify-center gap-2 bg-(--linear-bg-surface-0) px-6 py-8 text-center'>
            <Loader2
              className='h-5 w-5 animate-spin text-secondary-token'
              aria-hidden
            />
            <span className='text-[13px] text-secondary-token'>
              Loading platform connections...
            </span>
          </ContentSurfaceCard>
        </div>
      </DashboardCard>
    );
  }

  if (error) {
    return (
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <ContentSectionHeader
          title='Streaming profiles'
          subtitle='Connect and sync your primary artist profiles across streaming platforms.'
          className='min-h-0 px-4 py-3'
        />
        <div className='px-4 py-3'>
          <ContentSurfaceCard className='px-6 py-8 text-center bg-(--linear-bg-surface-0)'>
            <p className='text-[13px] text-secondary-token'>
              Failed to load platform connections. Please try again.
            </p>
          </ContentSurfaceCard>
        </div>
      </DashboardCard>
    );
  }

  const isSpotifyConnected = !!spotifyId || !!spotifyMatch;
  const hasNoConnections = !spotifyId && !spotifyMatch && !appleMusicMatch;

  return (
    <>
      <ConnectedDspListContent
        isSpotifyConnected={isSpotifyConnected}
        spotifyId={spotifyId}
        spotifyMatch={spotifyMatch}
        appleMusicMatch={appleMusicMatch}
        nonPrimaryMatches={nonPrimaryMatches}
        hasNoConnections={hasNoConnections}
        handleOpenPalette={handleOpenPalette}
        handleSyncNow={handleSyncNow}
        handleDisconnect={handleDisconnect}
        paletteOpen={paletteOpen}
        setPaletteOpen={setPaletteOpen}
        paletteProvider={paletteProvider}
        handlePaletteSelect={handlePaletteSelect}
      />
      <ConfirmDialog
        open={!!matchToDisconnect}
        onOpenChange={handleDisconnectCancel}
        title={`Disconnect ${matchToDisconnect ? getProviderLabel(matchToDisconnect.providerId as DspProviderId) : 'provider'}?`}
        description='Disconnecting will stop sync updates for this provider until you reconnect it.'
        confirmLabel='Disconnect'
        variant='destructive'
        onConfirm={handleDisconnectConfirm}
      />
    </>
  );
}

interface ConnectedDspListContentProps {
  readonly isSpotifyConnected: boolean;
  readonly spotifyId: string | null;
  readonly spotifyMatch: DspMatch | undefined;
  readonly appleMusicMatch: DspMatch | undefined;
  readonly nonPrimaryMatches: ReadonlyArray<{
    provider: NonPrimaryDspProvider;
    match: DspMatch;
  }>;
  readonly hasNoConnections: boolean;
  readonly handleOpenPalette: (provider: PrimaryDspProvider) => void;
  readonly handleSyncNow: (provider: DspProviderId) => void;
  readonly handleDisconnect: (match: DspMatch | undefined) => void;
  readonly paletteOpen: boolean;
  readonly setPaletteOpen: (open: boolean) => void;
  readonly paletteProvider: PrimaryDspProvider;
  readonly handlePaletteSelect: (artist: ArtistSelection) => Promise<void>;
}

/**
 * Build pill props for a primary DSP provider.
 *
 * Both Spotify and Apple Music use the same pattern:
 * - When connected: show sync (if spotifyId available) + disconnect
 * - When not connected: show connect action
 */
function getPrimaryPillProps(
  provider: PrimaryDspProvider,
  isConnected: boolean,
  match: DspMatch | undefined,
  spotifyId: string | null,
  handleOpenPalette: (provider: PrimaryDspProvider) => void,
  handleSyncNow: (provider: DspProviderId) => void,
  handleDisconnect: (match: DspMatch | undefined) => void
) {
  return {
    provider,
    connected: isConnected,
    artistName: match?.externalArtistName,
    onClick: isConnected ? undefined : () => handleOpenPalette(provider),
    onSyncNow:
      isConnected && spotifyId ? () => handleSyncNow(provider) : undefined,
    onDisconnect: match ? () => handleDisconnect(match) : undefined,
  };
}

function ConnectedDspListContent({
  isSpotifyConnected,
  spotifyId,
  spotifyMatch,
  appleMusicMatch,
  nonPrimaryMatches,
  hasNoConnections,
  handleOpenPalette,
  handleSyncNow,
  handleDisconnect,
  paletteOpen,
  setPaletteOpen,
  paletteProvider,
  handlePaletteSelect,
}: ConnectedDspListContentProps) {
  const spotifyProps = getPrimaryPillProps(
    'spotify',
    isSpotifyConnected,
    spotifyMatch,
    spotifyId,
    handleOpenPalette,
    handleSyncNow,
    handleDisconnect
  );
  const appleProps = getPrimaryPillProps(
    'apple_music',
    !!appleMusicMatch,
    appleMusicMatch,
    spotifyId,
    handleOpenPalette,
    handleSyncNow,
    handleDisconnect
  );

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='overflow-hidden'
    >
      <ContentSectionHeader
        title='Streaming profiles'
        subtitle='Connect and sync your primary artist profiles across streaming platforms.'
        className='min-h-0 px-4 py-3'
      />
      <div className='space-y-3 px-4 py-3'>
        <ContentSurfaceCard className='space-y-3 bg-(--linear-bg-surface-0) p-4'>
          <div className='space-y-1'>
            <p className='text-[13px] font-[510] tracking-[-0.01em] text-(--linear-text-primary)'>
              Primary platforms
            </p>
            <p className='text-[13px] leading-[18px] text-(--linear-text-secondary)'>
              Connect your Spotify and Apple Music artist profiles.
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <DspConnectionPill {...spotifyProps} />
            <DspConnectionPill {...appleProps} />
          </div>
        </ContentSurfaceCard>

        {hasNoConnections ? (
          <ContentSurfaceCard className='flex flex-col items-center justify-center gap-2 bg-(--linear-bg-surface-0) px-6 py-10 text-center'>
            <Music
              className='h-8 w-8 text-(--linear-text-tertiary)'
              aria-hidden
            />
            <p className='text-[13px] text-(--linear-text-secondary)'>
              Click a platform above to connect your streaming profiles.
            </p>
          </ContentSurfaceCard>
        ) : null}

        {nonPrimaryMatches.length > 0 ? (
          <ContentSurfaceCard className='space-y-3 bg-(--linear-bg-surface-0) p-4'>
            <div className='space-y-1'>
              <p className='text-[13px] font-[510] tracking-[-0.01em] text-(--linear-text-primary)'>
                Other platforms
              </p>
              <p className='text-[13px] leading-[18px] text-(--linear-text-secondary)'>
                Secondary DSP matches connected to this profile.
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              {nonPrimaryMatches.map(({ provider, match }) => (
                <DspConnectionPill
                  key={provider}
                  provider={provider}
                  connected
                  artistName={match.externalArtistName}
                  onSyncNow={
                    spotifyId ? () => handleSyncNow(provider) : undefined
                  }
                  onDisconnect={() => handleDisconnect(match)}
                />
              ))}
            </div>
          </ContentSurfaceCard>
        ) : null}
      </div>
      <ArtistSearchCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        provider={paletteProvider}
        onArtistSelect={handlePaletteSelect}
      />
    </DashboardCard>
  );
}
