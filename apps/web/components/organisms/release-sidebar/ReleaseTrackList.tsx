'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@jovie/ui';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Pause,
  Play,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CopyableMonospaceCell } from '@/components/atoms/CopyableMonospaceCell';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { SeekBar } from '@/components/atoms/SeekBar';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import {
  DrawerEmptyState,
  DrawerInlineIconButton,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import {
  summarizePreviewCounts,
  summarizeReleaseProviderCounts,
} from '@/lib/discography/audio-qa';
import { PROVIDER_LABELS } from '@/lib/discography/provider-labels';
import type {
  PreviewVerification,
  ProviderConfidence,
  ReleaseSidebarTrack,
} from '@/lib/discography/types';
import { useReleaseTracksQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import type { Release } from './types';
import { useTrackAudioPlayer } from './useTrackAudioPlayer';

interface ReleaseTrackListProps {
  readonly release: Release;
  readonly tracksOverride?: ReleaseSidebarTrack[];
}

function getPreviewStatusLabel(
  previewVerification: PreviewVerification | undefined
): string {
  switch (previewVerification) {
    case 'verified':
      return 'Ready';
    case 'fallback':
      return 'Unconfirmed';
    case 'unknown':
      return 'Pending';
    case 'missing':
    default:
      return 'Not checked';
  }
}

function getPreviewStatusToneClass(
  previewVerification: PreviewVerification | undefined
): string {
  switch (previewVerification) {
    case 'fallback':
      return 'text-secondary-token';
    case 'unknown':
      return 'text-amber-300';
    case 'verified':
      return 'text-tertiary-token';
    case 'missing':
    default:
      return 'text-quaternary-token';
  }
}

function getPreviewSourceLabel(
  source: ReleaseSidebarTrack['previewSource']
): string {
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
      return 'Preview source';
  }
}

function getProviderConfidenceLabel(
  confidence: ProviderConfidence | undefined
): string | null {
  switch (confidence) {
    case 'search_fallback':
      return 'Unconfirmed';
    case 'manual_override':
      return 'Manual override';
    default:
      return null;
  }
}

function partitionProvidersByConfidence(
  providers: ReleaseSidebarTrack['providers']
): {
  canonicalProviders: ReleaseSidebarTrack['providers'];
  fallbackProviders: ReleaseSidebarTrack['providers'];
  unverifiedProviders: ReleaseSidebarTrack['providers'];
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
      canonicalProviders: ReleaseSidebarTrack['providers'];
      fallbackProviders: ReleaseSidebarTrack['providers'];
      unverifiedProviders: ReleaseSidebarTrack['providers'];
    }
  );
}

export function ReleaseTrackList({
  release,
  tracksOverride,
}: ReleaseTrackListProps) {
  const { playbackState, toggleTrack, seek } = useTrackAudioPlayer();
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const {
    data: fetchedTracks,
    isLoading,
    isFetching,
    isError: hasError,
  } = useReleaseTracksQuery(
    release.id,
    !tracksOverride && release.totalTracks > 0
  );
  const tracks = tracksOverride ?? fetchedTracks;

  useEffect(() => {
    setExpandedTrackId(null);
  }, [release.id]);

  const previewCounts = useMemo(
    () => summarizePreviewCounts(tracks ?? []),
    [tracks]
  );
  const providerCounts = useMemo(
    () => summarizeReleaseProviderCounts(tracks ?? []),
    [tracks]
  );
  let liveAnnouncement: string;
  if (playbackState.playbackStatus === 'error') {
    liveAnnouncement = 'Preview unavailable.';
  } else if (playbackState.trackTitle) {
    liveAnnouncement = `Now playing ${playbackState.trackTitle}.`;
  } else {
    liveAnnouncement = '';
  }

  if (release.totalTracks === 0) return null;

  return (
    <div className='space-y-2.5' data-testid='release-playback-card'>
      <p className='sr-only' aria-live='polite'>
        {liveAnnouncement}
      </p>

      <DrawerSurfaceCard
        className={cn(
          LINEAR_SURFACE.drawerCardSm,
          'overflow-hidden px-2.5 py-2'
        )}
        data-testid='release-playback-summary'
      >
        <p
          className='text-[11px] text-tertiary-token'
          data-testid='release-preview-summary'
        >
          Audio Previews:{' '}
          {[
            previewCounts.verified > 0 && `${previewCounts.verified} ready`,
            previewCounts.fallback > 0 &&
              `${previewCounts.fallback} unconfirmed`,
            previewCounts.unknown > 0 && `${previewCounts.unknown} pending`,
          ]
            .filter(Boolean)
            .join(', ') || 'none'}
        </p>
        <p
          className='mt-1 text-[11px] text-tertiary-token'
          data-testid='release-provider-summary'
        >
          Providers:{' '}
          {[
            providerCounts.canonical > 0 &&
              `${providerCounts.canonical} linked`,
            providerCounts.searchFallback > 0 &&
              `${providerCounts.searchFallback} unconfirmed`,
            providerCounts.unknown > 0 && `${providerCounts.unknown} pending`,
          ]
            .filter(Boolean)
            .join(', ') || 'none'}
        </p>
      </DrawerSurfaceCard>

      {(isLoading || (isFetching && !tracks)) && (
        <div className='space-y-1.5'>
          {(['sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5'] as const)
            .slice(0, Math.min(release.totalTracks, 6))
            .map(id => (
              <DrawerSurfaceCard
                key={id}
                className={cn(LINEAR_SURFACE.drawerCardSm, 'px-3 py-3')}
              >
                <div className='space-y-2'>
                  <div className='h-4 w-1/2 rounded skeleton' />
                  <div className='h-3 w-1/3 rounded skeleton' />
                </div>
              </DrawerSurfaceCard>
            ))}
        </div>
      )}

      {!isLoading && hasError && (
        <DrawerEmptyState
          className='min-h-[48px] px-3'
          message='Failed to load playback tracks.'
          tone='error'
        />
      )}

      {!isLoading && !hasError && tracks?.length === 0 && (
        <DrawerEmptyState
          className='min-h-[48px] px-3'
          message='No track data available.'
        />
      )}

      {!isLoading &&
        !hasError &&
        tracks?.map(track => (
          <TrackPlaybackRow
            key={track.id}
            expanded={expandedTrackId === track.id}
            onToggleExpanded={() =>
              setExpandedTrackId(current =>
                current === track.id ? null : track.id
              )
            }
            track={track}
            release={release}
            playbackState={playbackState}
            onSeek={seek}
            onToggleTrack={toggleTrack}
          />
        ))}
    </div>
  );
}

function TrackPlaybackRow({
  expanded,
  onToggleExpanded,
  track,
  release,
  playbackState,
  onToggleTrack,
  onSeek,
}: {
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly track: ReleaseSidebarTrack;
  readonly release: Release;
  readonly playbackState: {
    activeTrackId: string | null;
    isPlaying: boolean;
    playbackStatus?: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
    currentTime: number;
    duration: number;
  };
  readonly onToggleTrack: (track: {
    id: string;
    title: string;
    audioUrl: string;
    releaseTitle?: string;
    artistName?: string;
    artworkUrl?: string | null;
  }) => Promise<void>;
  readonly onSeek: (time: number) => void;
}) {
  const trackLabel =
    track.discNumber > 1
      ? `${track.discNumber}-${track.trackNumber}`
      : String(track.trackNumber);
  const playableUrl = track.audioUrl ?? track.previewUrl;
  const isActiveTrack = playbackState.activeTrackId === track.id;
  const isTrackPlaying = isActiveTrack && playbackState.isPlaying;
  const progressDuration = isActiveTrack ? playbackState.duration : 0;
  const progressCurrentTime = isActiveTrack ? playbackState.currentTime : 0;
  const statusLabel = getPreviewStatusLabel(track.previewVerification);
  const statusToneClass = getPreviewStatusToneClass(track.previewVerification);
  const summary = track.providerConfidenceSummary;
  const { canonicalProviders, fallbackProviders, unverifiedProviders } =
    partitionProvidersByConfidence(track.providers);
  const unresolvedProviders = summary?.unresolvedProviders ?? [];
  const panelId = `release-playback-panel-${track.id}`;

  const handleTogglePlayback = useCallback(() => {
    if (!playableUrl) return;

    onToggleTrack({
      id: track.id,
      title: track.title,
      audioUrl: playableUrl,
      releaseTitle: release.title,
      artistName: release.artistNames?.[0],
      artworkUrl: release.artworkUrl,
    }).catch(() => {
      toast.error('Unable to play this track right now');
    });
  }, [
    onToggleTrack,
    playableUrl,
    release.artistNames,
    release.artworkUrl,
    release.title,
    track.id,
    track.title,
  ]);

  return (
    <DrawerSurfaceCard
      className={cn(
        LINEAR_SURFACE.drawerCardSm,
        'overflow-hidden',
        expanded && 'bg-surface-0'
      )}
      data-testid={`release-track-row-${track.id}`}
    >
      <div className='px-2.5 py-2.5'>
        <div className='grid min-h-11 grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2'>
          <button
            type='button'
            aria-expanded={expanded}
            aria-controls={panelId}
            className='flex min-h-11 min-w-0 items-start gap-2 rounded-[10px] text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
            onClick={onToggleExpanded}
          >
            <span className='flex min-h-11 w-6 shrink-0 items-center justify-end text-right text-[10px] tabular-nums text-tertiary-token'>
              {trackLabel}.
            </span>

            <div className='min-w-0 flex-1 pt-0.5'>
              <div className='flex items-center gap-1.5'>
                <TruncatedText
                  lines={1}
                  className='text-[12px] font-[510] text-primary-token'
                  tooltipSide='top'
                >
                  {track.title}
                </TruncatedText>
                {track.isExplicit ? (
                  <span className='rounded-[4px] bg-surface-1 px-1 text-[8px] font-[510] text-tertiary-token'>
                    E
                  </span>
                ) : null}
              </div>
              <p
                className='mt-1 text-[10px] text-tertiary-token'
                data-testid={`release-track-provider-summary-${track.id}`}
              >
                {[
                  (summary?.canonical ?? 0) > 0 &&
                    `${summary?.canonical} linked`,
                  (summary?.searchFallback ?? 0) > 0 &&
                    `${summary?.searchFallback} unconfirmed`,
                  (summary?.unknown ?? 0) > 0 && `${summary?.unknown} pending`,
                ]
                  .filter(Boolean)
                  .join(', ') || 'none'}
              </p>
              <p
                className={cn('mt-0.5 text-[10px]', statusToneClass)}
                data-testid={`release-track-status-${track.id}`}
              >
                {statusLabel}
              </p>
            </div>

            <span className='flex h-11 w-5 shrink-0 items-center justify-center text-quaternary-token'>
              {expanded ? (
                <ChevronDown className='h-3.5 w-3.5' aria-hidden='true' />
              ) : (
                <ChevronRight className='h-3.5 w-3.5' aria-hidden='true' />
              )}
            </span>
          </button>

          {playableUrl ? (
            <button
              type='button'
              onClick={event => {
                event.stopPropagation();
                handleTogglePlayback();
              }}
              className='flex h-11 w-11 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 text-secondary-token transition-[background-color,color,border-color] duration-150 hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
              aria-label={isTrackPlaying ? 'Pause preview' : 'Play preview'}
            >
              {isTrackPlaying ? (
                <Pause className='h-3.5 w-3.5' />
              ) : (
                <Play className='h-3.5 w-3.5 translate-x-px' />
              )}
            </button>
          ) : (
            <span className='flex h-11 w-11 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 text-quaternary-token'>
              <span className='sr-only'>No preview available</span>
              <VolumeX className='h-3.5 w-3.5' />
            </span>
          )}

          <TrackActionsMenu track={track} />
        </div>

        {expanded ? (
          <div
            id={panelId}
            className='space-y-3 border-t border-(--linear-app-frame-seam) pt-3'
          >
            {playableUrl ? (
              <div className='space-y-1.5'>
                <SeekBar
                  currentTime={progressCurrentTime}
                  duration={progressDuration}
                  onSeek={onSeek}
                  disabled={!isActiveTrack}
                  className='h-0.5 w-full bg-surface-1/90'
                />
                <div className='flex items-center justify-between text-[10px] text-tertiary-token'>
                  <span className='tabular-nums'>
                    {isActiveTrack
                      ? formatDuration(progressCurrentTime * 1000)
                      : '0:00'}
                  </span>
                  <span className='tabular-nums'>
                    {progressDuration > 0
                      ? formatDuration(progressDuration * 1000)
                      : '0:00'}
                  </span>
                </div>
              </div>
            ) : (
              <p className='text-[10px] text-tertiary-token'>
                {track.previewVerification === 'unknown'
                  ? 'Preview unverified. Verify on streaming platforms.'
                  : 'Preview not checked yet.'}
              </p>
            )}

            {track.previewVerification === 'fallback' && track.previewSource ? (
              <p className='text-[10px] text-tertiary-token'>
                Source: {getPreviewSourceLabel(track.previewSource)}
              </p>
            ) : null}

            <div className='space-y-2'>
              {canonicalProviders.length > 0 ? (
                <ProviderGroup
                  title='Linked DSPs'
                  providers={canonicalProviders}
                  testId={`release-track-canonical-providers-${track.id}`}
                />
              ) : null}
              {fallbackProviders.length > 0 ? (
                <ProviderGroup
                  title='Unconfirmed DSPs'
                  providers={fallbackProviders}
                  testId={`release-track-fallback-providers-${track.id}`}
                />
              ) : null}
              {unverifiedProviders.length > 0 ? (
                <ProviderGroup
                  title='Pending DSPs'
                  providers={unverifiedProviders}
                  testId={`release-track-unverified-providers-${track.id}`}
                />
              ) : null}
              {unresolvedProviders.length > 0 ? (
                <p
                  className='text-[10px] text-tertiary-token'
                  data-testid={`release-track-unresolved-${track.id}`}
                >
                  Unresolved:{' '}
                  {unresolvedProviders
                    .map(provider => PROVIDER_LABELS[provider])
                    .join(', ')}
                </p>
              ) : null}
            </div>

            <div className='flex flex-wrap items-center gap-2 text-[10px] text-tertiary-token'>
              {track.durationMs != null ? (
                <span className='tabular-nums'>
                  {formatDuration(track.durationMs)}
                </span>
              ) : null}
              {track.isrc ? (
                <CopyableMonospaceCell
                  value={track.isrc}
                  label='ISRC'
                  size='sm'
                  maxWidth={96}
                  className='-mx-0.5 h-5 px-0.5 text-[9.5px] text-tertiary-token hover:bg-surface-1'
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </DrawerSurfaceCard>
  );
}

function ProviderGroup({
  title,
  providers,
  testId,
}: {
  readonly title: string;
  readonly providers: ReleaseSidebarTrack['providers'];
  readonly testId?: string;
}) {
  return (
    <div className='space-y-1' data-testid={testId}>
      <p className='text-[10px] text-tertiary-token'>{title}</p>
      <div className='space-y-1'>
        {providers.map(provider => {
          const confidenceLabel = getProviderConfidenceLabel(
            provider.confidence
          );

          return (
            <div
              key={`${provider.key}-${provider.url}`}
              className='flex items-center justify-between gap-2 rounded-[10px] bg-surface-0 px-2.5 py-2'
            >
              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <ProviderIcon
                    provider={provider.key}
                    className='h-3.5 w-3.5 shrink-0'
                    aria-hidden='true'
                  />
                  <span className='truncate text-[11px] text-primary-token'>
                    {PROVIDER_LABELS[provider.key] ?? provider.label}
                  </span>
                </div>
                {confidenceLabel ? (
                  <p className='mt-0.5 text-[10px] text-tertiary-token'>
                    {confidenceLabel}
                  </p>
                ) : null}
              </div>
              <button
                type='button'
                onClick={() =>
                  globalThis.open(provider.url, '_blank', 'noopener,noreferrer')
                }
                className='text-[10px] text-tertiary-token transition-colors hover:text-primary-token'
              >
                Open
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrackActionsMenu({ track }: { readonly track: ReleaseSidebarTrack }) {
  const streamingProviders = track.providers.filter(p => p.url);

  const handleCopyIsrc = useCallback(() => {
    if (track.isrc) {
      navigator.clipboard.writeText(track.isrc).then(
        () => toast.success('ISRC copied'),
        () => toast.error('Failed to copy ISRC')
      );
    }
  }, [track.isrc]);

  const handleCopySmartLink = useCallback(() => {
    const smartLinkUrl = `${getBaseUrl()}${track.smartLinkPath}`;
    navigator.clipboard.writeText(smartLinkUrl).then(
      () => toast.success('Smart link copied'),
      () => toast.error('Failed to copy link')
    );
  }, [track.smartLinkPath]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <DrawerInlineIconButton
          aria-label={`Actions for ${track.title}`}
          className='h-9 w-9 rounded-full border border-transparent opacity-60 hover:border-(--linear-app-frame-seam) hover:bg-surface-0 hover:opacity-100'
          onClick={event => event.stopPropagation()}
        >
          <MoreHorizontal className='h-3 w-3 text-tertiary-token' />
        </DrawerInlineIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-48'>
        {track.isrc ? (
          <DropdownMenuItem onClick={handleCopyIsrc}>
            <Copy className='mr-2 h-3.5 w-3.5' />
            Copy ISRC
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={handleCopySmartLink}>
          <Link2 className='mr-2 h-3.5 w-3.5' />
          Copy smart link
        </DropdownMenuItem>
        {streamingProviders.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ExternalLink className='mr-2 h-3.5 w-3.5' />
                Open on platform
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {streamingProviders.map(provider => (
                  <DropdownMenuItem
                    key={provider.key}
                    onClick={() =>
                      globalThis.open(
                        provider.url,
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                  >
                    <ProviderIcon
                      provider={provider.key}
                      className='mr-2 h-3.5 w-3.5'
                      aria-label={
                        PROVIDER_LABELS[provider.key] ?? provider.label
                      }
                    />
                    {PROVIDER_LABELS[provider.key] ?? provider.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
