'use client';

import { Check, Copy, ExternalLink, Pause, Play, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SeekBar } from '@/components/atoms/SeekBar';
import { CopyableUrlRow } from '@/components/molecules/CopyableUrlRow';
import {
  DrawerBackButton,
  DrawerCardActionBar,
  DrawerMediaThumb,
  DrawerSurfaceCard,
  DrawerTabbedCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { EntityHeaderCard } from '@/components/molecules/drawer/EntityHeaderCard';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { PROVIDER_LABELS } from '@/lib/discography/provider-labels';
import type {
  PreviewSource,
  PreviewVerification,
  ProviderConfidence,
  ProviderConfidenceSummary,
  ProviderKey,
} from '@/lib/discography/types';
import { formatDuration } from '@/lib/utils/formatDuration';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { TrackPlatformLinksSection } from './TrackPlatformLinksSection';
import { useTrackAudioPlayer } from './useTrackAudioPlayer';

type TrackSidebarTab = 'playback' | 'platforms';

const TRACK_SIDEBAR_TAB_OPTIONS = [
  { value: 'playback' as const, label: 'Playback' },
  { value: 'platforms' as const, label: 'Platforms' },
];

export interface TrackSidebarData {
  id: string;
  title: string;
  slug: string;
  smartLinkPath: string;
  trackNumber: number;
  discNumber: number;
  durationMs: number | null;
  isrc: string | null;
  isExplicit: boolean;
  previewUrl: string | null;
  audioUrl: string | null;
  audioFormat: string | null;
  lyrics?: string | null;
  previewSource?: PreviewSource;
  previewVerification?: PreviewVerification;
  providerConfidenceSummary?: ProviderConfidenceSummary;
  providers: Array<{
    key: ProviderKey;
    label: string;
    url: string;
    confidence?: ProviderConfidence;
  }>;
  releaseTitle: string;
  releaseArtworkUrl?: string | null;
  releaseId: string;
}

export interface TrackSidebarProps {
  readonly track: TrackSidebarData | null;
  readonly isOpen: boolean;
  readonly width?: number;
  readonly onClose: () => void;
  readonly onBackToRelease?: (releaseId: string) => void;
}

function getPreviewStatusLabel(
  previewVerification: PreviewVerification | undefined
): string {
  switch (previewVerification) {
    case 'verified':
      return 'Verified Preview';
    case 'fallback':
      return 'Fallback Preview';
    case 'unknown':
      return 'Preview Unverified';
    case 'missing':
    default:
      return 'Preview Not Checked';
  }
}

function getPreviewSourceLabel(
  source: PreviewSource | undefined
): string | null {
  switch (source) {
    case 'spotify':
      return 'Spotify preview';
    case 'apple_music':
      return 'Apple Music preview';
    case 'deezer':
      return 'Deezer preview';
    case 'musicfetch':
      return 'MusicFetch preview';
    case 'audio_url':
      return 'Stored audio';
    default:
      return null;
  }
}

function getPlaybackAnnouncement(params: {
  title: string | null | undefined;
  playbackStatus: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  isActiveTrack: boolean;
  isPlaying: boolean;
}): string {
  if (params.playbackStatus === 'error') {
    return 'Preview unavailable.';
  }

  if (!params.title || !params.isActiveTrack) {
    return '';
  }

  if (params.isPlaying) {
    return `Now playing ${params.title}.`;
  }

  if (params.playbackStatus === 'paused') {
    return `Paused ${params.title}.`;
  }

  return '';
}

function partitionProvidersByConfidence(
  providers: TrackSidebarData['providers']
): {
  canonicalProviders: TrackSidebarData['providers'];
  fallbackProviders: TrackSidebarData['providers'];
  unverifiedProviders: TrackSidebarData['providers'];
} {
  return providers.reduce(
    (groups, provider) => {
      if (provider.confidence === 'search_fallback') {
        groups.fallbackProviders.push(provider);
        return groups;
      }

      if (
        provider.confidence === 'canonical' ||
        provider.confidence === 'manual_override'
      ) {
        groups.canonicalProviders.push(provider);
        return groups;
      }

      groups.unverifiedProviders.push(provider);
      return groups;
    },
    {
      canonicalProviders: [],
      fallbackProviders: [],
      unverifiedProviders: [],
    } as {
      canonicalProviders: TrackSidebarData['providers'];
      fallbackProviders: TrackSidebarData['providers'];
      unverifiedProviders: TrackSidebarData['providers'];
    }
  );
}

export function TrackSidebar({
  track,
  isOpen,
  width,
  onClose,
  onBackToRelease,
}: TrackSidebarProps) {
  const [isSmartLinkCopied, setIsSmartLinkCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TrackSidebarTab>('playback');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { playbackState, toggleTrack, seek, onError } = useTrackAudioPlayer();

  useEffect(() => {
    const copyRef = copyTimeoutRef;
    return () => {
      if (copyRef.current) clearTimeout(copyRef.current);
    };
  }, []);

  useEffect(() => {
    setIsSmartLinkCopied(false);
    setActiveTab('playback');
  }, [track?.id]);

  const smartLinkUrl = track ? `${getBaseUrl()}${track.smartLinkPath}` : '';

  const showSmartLinkCopied = useCallback(() => {
    toast.success('Track link copied');
    setIsSmartLinkCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(
      () => setIsSmartLinkCopied(false),
      2000
    );
  }, []);

  const handleCopySmartLink = useCallback(() => {
    if (!smartLinkUrl) return;
    navigator.clipboard.writeText(smartLinkUrl).then(
      () => {
        showSmartLinkCopied();
      },
      () => toast.error('Failed to copy link')
    );
  }, [showSmartLinkCopied, smartLinkUrl]);

  const handleBackToRelease = useCallback(() => {
    if (track?.releaseId && onBackToRelease) {
      onBackToRelease(track.releaseId);
    }
  }, [track, onBackToRelease]);

  const streamingProviders = track?.providers.filter(p => p.url) ?? [];
  const { canonicalProviders, fallbackProviders, unverifiedProviders } =
    partitionProvidersByConfidence(streamingProviders);
  const unresolvedProviders =
    track?.providerConfidenceSummary?.unresolvedProviders ?? [];

  const overflowActions = useMemo<DrawerHeaderAction[]>(() => {
    if (!track) return [];
    return [
      {
        id: 'refresh-copy',
        label: isSmartLinkCopied ? 'Copied!' : 'Copy track link',
        icon: Copy,
        activeIcon: Check,
        isActive: isSmartLinkCopied,
        onClick: handleCopySmartLink,
      },
      {
        id: 'open',
        label: 'Open track link',
        icon: ExternalLink,
        onClick: () => {
          if (track.smartLinkPath) {
            globalThis.open(smartLinkUrl, '_blank', 'noopener,noreferrer');
          }
        },
      },
    ];
  }, [track, isSmartLinkCopied, handleCopySmartLink, smartLinkUrl]);

  const playableUrl = track?.audioUrl ?? track?.previewUrl ?? null;
  const isThisTrack = playbackState.activeTrackId === track?.id;
  const isPlaying = isThisTrack && playbackState.isPlaying;
  const currentTime = isThisTrack ? playbackState.currentTime : 0;
  const duration = isThisTrack ? playbackState.duration : 0;
  const liveAnnouncement = getPlaybackAnnouncement({
    title: track?.title,
    playbackStatus: playbackState.playbackStatus,
    isActiveTrack: isThisTrack,
    isPlaying,
  });

  useEffect(() => {
    return onError(reason => {
      if (!track || playbackState.activeTrackId !== track.id) return;

      if (reason === 'missing_source') {
        toast.error('Preview unavailable');
        return;
      }

      toast.error('Preview unavailable');
    });
  }, [onError, playbackState.activeTrackId, track]);

  const handleTogglePlayback = useCallback(() => {
    if (!track || !playableUrl) return;

    toggleTrack({
      id: track.id,
      title: track.title,
      audioUrl: playableUrl,
      releaseTitle: track.releaseTitle,
      artworkUrl: track.releaseArtworkUrl,
      hasLyrics: Boolean(track.lyrics?.trim()),
    }).catch(() => {});
  }, [playableUrl, toggleTrack, track]);

  let trackLabel: string;
  if (!track) {
    trackLabel = '';
  } else if (track.discNumber > 1) {
    trackLabel = `${track.discNumber}-${track.trackNumber}`;
  } else {
    trackLabel = String(track.trackNumber);
  }

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      width={width}
      ariaLabel='Track details'
      data-testid='track-sidebar'
      onClose={onClose}
      headerMode='minimal'
      hideMinimalHeaderBar={Boolean(track)}
      isEmpty={!track}
      emptyMessage='Select a track to view its details.'
      entityHeader={
        track ? (
          <div className='space-y-2.5'>
            <p className='sr-only' aria-live='polite'>
              {liveAnnouncement}
            </p>
            {onBackToRelease ? (
              <DrawerBackButton
                label={track.releaseTitle}
                onClick={handleBackToRelease}
              />
            ) : null}
            <DrawerSurfaceCard variant='card' className='overflow-hidden p-3.5'>
              <EntityHeaderCard
                eyebrow='Track'
                title={track.title}
                subtitle={
                  <span className='flex items-center gap-1.5'>
                    <span className='tabular-nums'>{trackLabel}.</span>
                    {track.releaseTitle}
                    {track.isExplicit ? (
                      <span className='rounded-[4px] bg-surface-1 px-1 text-[9px] font-caption text-tertiary-token'>
                        E
                      </span>
                    ) : null}
                  </span>
                }
                image={
                  <DrawerMediaThumb
                    src={track.releaseArtworkUrl}
                    alt={`${track.releaseTitle} artwork`}
                    sizeClassName='h-[72px] w-[72px] rounded-[10px]'
                    sizes='72px'
                    fallback={
                      <div className='h-[72px] w-[72px] rounded-[10px] bg-surface-1' />
                    }
                  />
                }
                meta={
                  <div className='flex flex-wrap items-center gap-2 text-[10.5px] text-tertiary-token'>
                    {track.durationMs == null ? null : (
                      <span className='tabular-nums'>
                        {formatDuration(track.durationMs)}
                      </span>
                    )}
                    {track.isrc ? (
                      <span className='font-mono text-[9.5px] tracking-[0.02em]'>
                        {track.isrc}
                      </span>
                    ) : null}
                  </div>
                }
                actions={
                  <DrawerCardActionBar
                    primaryActions={[]}
                    overflowActions={overflowActions}
                    onClose={onClose}
                    overflowTriggerPlacement='card-top-right'
                    overflowTriggerIcon='vertical'
                    className='border-0 bg-transparent px-0 py-0'
                  />
                }
                footer={
                  smartLinkUrl ? (
                    <CopyableUrlRow
                      url={smartLinkUrl}
                      size='sm'
                      surface='boxed'
                      copyButtonTitle='Copy track link'
                      openButtonTitle='Open track link'
                      onCopySuccess={() => {
                        showSmartLinkCopied();
                      }}
                      onCopyError={() => {
                        toast.error('Failed to copy link');
                      }}
                    />
                  ) : null
                }
                bodyClassName='pr-9'
              />
            </DrawerSurfaceCard>
          </div>
        ) : undefined
      }
    >
      {track ? (
        <DrawerTabbedCard
          testId='track-tabbed-card'
          tabs={
            <DrawerTabs
              value={activeTab}
              onValueChange={value => setActiveTab(value as TrackSidebarTab)}
              options={TRACK_SIDEBAR_TAB_OPTIONS}
              ariaLabel='Track sidebar tabs'
              overflowMode='scroll'
              distribution='intrinsic'
            />
          }
          contentClassName='pt-2'
        >
          {activeTab === 'playback' ? (
            <DrawerSurfaceCard variant='flat' className='overflow-hidden'>
              <div className='space-y-3 p-2.5'>
                <div className='flex min-h-11 items-center gap-2'>
                  {playableUrl ? (
                    <button
                      type='button'
                      onClick={handleTogglePlayback}
                      aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                      aria-pressed={isPlaying}
                      className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 text-secondary-token transition-[background-color,color,border-color] duration-150 hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
                    >
                      {isPlaying ? (
                        <Pause className='h-4 w-4' />
                      ) : (
                        <Play className='h-4 w-4 translate-x-px' />
                      )}
                    </button>
                  ) : (
                    <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 text-quaternary-token'>
                      <VolumeX className='h-4 w-4' />
                    </span>
                  )}

                  <div className='min-w-0 flex-1 space-y-1'>
                    <SeekBar
                      currentTime={currentTime}
                      duration={duration}
                      onSeek={seek}
                      disabled={!isThisTrack}
                      className='h-[3px] w-full'
                    />
                    <div className='flex items-center justify-between text-[10px] tabular-nums text-tertiary-token'>
                      <span>
                        {formatDuration(Math.round(currentTime) * 1000)}
                      </span>
                      <span>
                        {duration > 0
                          ? formatDuration(Math.round(duration) * 1000)
                          : '0:00'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className='space-y-1 text-2xs text-tertiary-token'>
                  <p>{getPreviewStatusLabel(track.previewVerification)}</p>
                  {track.previewVerification === 'fallback' ? (
                    <p>
                      {getPreviewSourceLabel(track.previewSource) ??
                        'Fallback source'}
                    </p>
                  ) : null}
                  {track.previewVerification === 'unknown' ? (
                    <p>Preview unavailable. Verify on streaming platforms.</p>
                  ) : null}
                </div>

                <div className='text-2xs text-tertiary-token'>
                  Providers: {track.providerConfidenceSummary?.canonical ?? 0}{' '}
                  canonical,{' '}
                  {track.providerConfidenceSummary?.searchFallback ?? 0}{' '}
                  fallback
                  {track.providerConfidenceSummary?.unknown
                    ? `, ${track.providerConfidenceSummary.unknown} unknown`
                    : ''}
                </div>

                {unresolvedProviders.length > 0 ? (
                  <p className='text-2xs text-tertiary-token'>
                    Unresolved:{' '}
                    {unresolvedProviders
                      .map(provider => PROVIDER_LABELS[provider])
                      .join(', ')}
                  </p>
                ) : null}
              </div>
            </DrawerSurfaceCard>
          ) : (
            <div className='space-y-2'>
              <TrackPlatformLinksSection
                providers={canonicalProviders}
                title='Canonical DSPs'
              />
              {fallbackProviders.length > 0 ? (
                <TrackPlatformLinksSection
                  providers={fallbackProviders}
                  title='Search Fallback'
                  emptyMessage='No fallback DSP links available.'
                />
              ) : null}
              {unverifiedProviders.length > 0 ? (
                <TrackPlatformLinksSection
                  providers={unverifiedProviders}
                  title='Unverified DSPs'
                  emptyMessage='No unverified DSP links available.'
                />
              ) : null}
            </div>
          )}
        </DrawerTabbedCard>
      ) : null}
    </EntitySidebarShell>
  );
}
