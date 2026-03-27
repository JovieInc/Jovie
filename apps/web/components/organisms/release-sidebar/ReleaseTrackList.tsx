'use client';

import {
  Badge,
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
  Copy,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Pause,
  Play,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { CopyableMonospaceCell } from '@/components/atoms/CopyableMonospaceCell';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { SeekBar } from '@/components/atoms/SeekBar';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import {
  CollapsibleSectionHeading,
  DrawerEmptyState,
  DrawerInlineIconButton,
  DrawerSection,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { PROVIDER_LABELS } from '@/lib/discography/provider-labels';
import { useReleaseTracksQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import type { Release, ReleaseSidebarTrack } from './types';
import { useTrackAudioPlayer } from './useTrackAudioPlayer';

interface ReleaseTrackListProps {
  readonly release: Release;
  readonly onTrackClick?: (track: ReleaseSidebarTrack) => void;
  readonly tracksOverride?: ReleaseSidebarTrack[];
  readonly showHeading?: boolean;
}

export function ReleaseTrackList({
  release,
  onTrackClick,
  tracksOverride,
  showHeading = true,
}: ReleaseTrackListProps) {
  const { playbackState, toggleTrack, seek } = useTrackAudioPlayer();
  const [isExpanded, setIsExpanded] = useState(true);
  const {
    data: fetchedTracks,
    isLoading,
    isFetching,
    isError: hasError,
    refetch,
  } = useReleaseTracksQuery(
    release.id,
    !tracksOverride && isExpanded && release.totalTracks > 0
  );
  const tracks = tracksOverride ?? fetchedTracks;

  const handleToggle = useCallback(async () => {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    setIsExpanded(true);

    if (!tracksOverride && hasError) {
      await refetch();
    }
  }, [hasError, isExpanded, refetch, tracksOverride]);

  if (release.totalTracks === 0) return null;

  const content = (
    <div
      id={showHeading ? `release-tracklist-${release.id}` : undefined}
      hidden={showHeading ? !isExpanded : undefined}
      className='space-y-1'
    >
      {(isLoading || (isFetching && !tracks)) && (
        <div className='space-y-1'>
          {(['sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5'] as const)
            .slice(0, Math.min(release.totalTracks, 6))
            .map(id => (
              <DrawerSurfaceCard
                key={id}
                className={cn(
                  LINEAR_SURFACE.drawerCardSm,
                  'flex items-start gap-2.5 px-2.5 py-2'
                )}
              >
                <div className='w-7 shrink-0 pt-0.5'>
                  <div className='ml-auto h-3.5 w-4 rounded skeleton' />
                </div>
                <div className='min-w-0 flex-1 space-y-1'>
                  <div className='h-4 w-3/4 rounded skeleton' />
                  <div className='h-3 w-1/3 rounded skeleton' />
                </div>
              </DrawerSurfaceCard>
            ))}
        </div>
      )}

      {!isLoading && hasError && (
        <DrawerEmptyState
          className='min-h-[48px] px-3'
          message='Failed to load tracks. Collapse and expand to retry.'
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
        tracks &&
        tracks.length > 0 &&
        tracks.map(track => (
          <TrackItem
            key={track.id}
            track={track}
            release={release}
            onClick={onTrackClick}
            playbackState={playbackState}
            onToggleTrack={toggleTrack}
            onSeek={seek}
          />
        ))}
    </div>
  );

  if (!showHeading) {
    return content;
  }

  return (
    <DrawerSection>
      <CollapsibleSectionHeading
        isOpen={isExpanded}
        onToggle={() => {
          handleToggle().catch(() => {});
        }}
        aria-controls={`release-tracklist-${release.id}`}
      >
        Tracks ({release.totalTracks})
      </CollapsibleSectionHeading>
      {content}
    </DrawerSection>
  );
}

function TrackItem({
  track,
  release,
  onClick,
  playbackState,
  onToggleTrack,
  onSeek,
}: {
  readonly track: ReleaseSidebarTrack;
  readonly release: Release;
  readonly onClick?: (track: ReleaseSidebarTrack) => void;
  readonly playbackState: {
    activeTrackId: string | null;
    isPlaying: boolean;
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

  const handleClick = useCallback(() => {
    onClick?.(track);
  }, [onClick, track]);

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

  const streamingProviders = track.providers.filter(p => p.url);
  const playableUrl = track.audioUrl ?? track.previewUrl;
  const isActiveTrack = playbackState.activeTrackId === track.id;
  const isTrackPlaying = isActiveTrack && playbackState.isPlaying;
  const progressDuration = isActiveTrack ? playbackState.duration : 0;
  const progressCurrentTime = isActiveTrack ? playbackState.currentTime : 0;

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
    track.id,
    track.title,
    release.title,
    release.artistNames,
    release.artworkUrl,
  ]);

  return (
    <div
      className={cn(
        'group flex items-start gap-2 rounded-[10px] border border-transparent bg-transparent px-2 py-1.5 shadow-none transition-[background-color] duration-150 hover:bg-surface-0 focus-within:bg-surface-0'
      )}
    >
      <span className='flex h-7 w-6 shrink-0 items-center justify-end text-right text-[10px] tabular-nums text-tertiary-token'>
        {trackLabel}.
      </span>

      <div className='min-w-0 flex-1'>
        <div className='flex items-start gap-2'>
          <button
            type='button'
            onClick={handleClick}
            className='min-w-0 flex-1 rounded-[8px] py-0.5 text-left focus-visible:outline-none'
          >
            <div className='flex items-center gap-1.5'>
              <TruncatedText
                lines={1}
                className='text-[12px] font-[510] text-primary-token'
                tooltipSide='top'
              >
                {track.title}
              </TruncatedText>
              {track.isExplicit && (
                <Badge
                  variant='secondary'
                  className='shrink-0 bg-surface-1 px-1 py-0 text-[8px] text-tertiary-token'
                >
                  E
                </Badge>
              )}
            </div>
          </button>

          {playableUrl && (
            <button
              type='button'
              onClick={event => {
                event.stopPropagation();
                handleTogglePlayback();
              }}
              className='mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 text-secondary-token transition-[background-color,color,border-color] duration-150 hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
              aria-label={isTrackPlaying ? 'Pause preview' : 'Play preview'}
            >
              {isTrackPlaying ? (
                <Pause className='h-[11px] w-[11px]' />
              ) : (
                <Play className='h-[11px] w-[11px]' />
              )}
            </button>
          )}
        </div>

        <div className='mt-0.5 flex items-center gap-1.5 pl-0.5 text-[9.5px] text-tertiary-token'>
          {track.durationMs != null && (
            <span className='tabular-nums'>
              {formatDuration(track.durationMs)}
            </span>
          )}
          {track.isrc && (
            <CopyableMonospaceCell
              value={track.isrc}
              label='ISRC'
              size='sm'
              maxWidth={88}
              className='-mx-0.5 h-4.5 px-0.5 text-[9.5px] text-tertiary-token hover:bg-surface-1'
            />
          )}
        </div>

        {playableUrl && (
          <div className='mt-1.5 space-y-1'>
            <div className='flex items-center gap-2'>
              <SeekBar
                currentTime={progressCurrentTime}
                duration={progressDuration}
                onSeek={time => {
                  onSeek(time);
                }}
                disabled={!isActiveTrack}
                className='h-0.5 flex-1 bg-surface-1/90'
              />
            </div>
            {isActiveTrack && (
              <p className='text-[10px] text-tertiary-token'>
                {track.audioFormat
                  ? `Audio preview · ${track.audioFormat.toUpperCase()}`
                  : 'Audio preview'}
                {progressDuration > 0 && progressDuration < 45
                  ? ` (${Math.round(progressDuration)}s)`
                  : ''}
              </p>
            )}
          </div>
        )}
      </div>

      <TrackActionsMenu
        track={track}
        streamingProviders={streamingProviders}
        onCopyIsrc={handleCopyIsrc}
        onCopySmartLink={handleCopySmartLink}
      />
    </div>
  );
}

function TrackActionsMenu({
  track,
  streamingProviders,
  onCopyIsrc,
  onCopySmartLink,
}: {
  readonly track: ReleaseSidebarTrack;
  readonly streamingProviders: ReleaseSidebarTrack['providers'];
  readonly onCopyIsrc: () => void;
  readonly onCopySmartLink: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <DrawerInlineIconButton
          aria-label={`Actions for ${track.title}`}
          className='h-5 w-5 self-center rounded-full border border-transparent opacity-60 group-hover:border-(--linear-app-frame-seam) group-hover:bg-surface-0 group-hover:opacity-100'
        >
          <MoreHorizontal className='h-3 w-3 text-tertiary-token' />
        </DrawerInlineIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-48'>
        {track.isrc && (
          <DropdownMenuItem onClick={onCopyIsrc}>
            <Copy className='mr-2 h-3.5 w-3.5' />
            Copy ISRC
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onCopySmartLink}>
          <Link2 className='mr-2 h-3.5 w-3.5' />
          Copy smart link
        </DropdownMenuItem>
        {streamingProviders.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ExternalLink className='mr-2 h-3.5 w-3.5' />
                Open on platform
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {streamingProviders.map(
                  (provider: ReleaseSidebarTrack['providers'][number]) => (
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
                  )
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
