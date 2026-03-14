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
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Pause,
  Play,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import {
  DRAWER_SECTION_HEADING_CLASSNAME,
  DrawerEmptyState,
  DrawerInlineIconButton,
  DrawerSection,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { PROVIDER_LABELS } from '@/lib/discography/provider-labels';
import { formatDuration } from '@/lib/utils/formatDuration';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import type { Release, ReleaseSidebarTrack } from './types';
import { useTrackAudioPlayer } from './useTrackAudioPlayer';

/**
 * Fetch tracks via the route handler instead of a server action.
 * Server action calls trigger RSC tree reconciliation which can
 * cause the parent drawer to unmount.
 */
async function fetchTracks(
  releaseId: string,
  signal?: AbortSignal
): Promise<ReleaseSidebarTrack[]> {
  const res = await fetch(
    `/api/dashboard/releases/${encodeURIComponent(releaseId)}/tracks`,
    { signal }
  );
  if (!res.ok) throw new Error('Failed to load tracks');
  return res.json() as Promise<ReleaseSidebarTrack[]>;
}

interface ReleaseTrackListProps {
  readonly release: Release;
  readonly onTrackClick?: (track: ReleaseSidebarTrack) => void;
  readonly tracksOverride?: ReleaseSidebarTrack[];
}

export function ReleaseTrackList({
  release,
  onTrackClick,
  tracksOverride,
}: ReleaseTrackListProps) {
  const { playbackState, toggleTrack } = useTrackAudioPlayer();
  const [isExpanded, setIsExpanded] = useState(true);
  const [tracks, setTracks] = useState<ReleaseSidebarTrack[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Auto-fetch tracks on mount since tracklist starts expanded
  useEffect(() => {
    if (release.totalTracks === 0) return;
    if (tracksOverride) {
      setTracks(tracksOverride);
      setHasError(false);
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    fetchTracks(release.id, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setTracks(data);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setTracks(null);
        setHasError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [release.id, release.totalTracks, tracksOverride]);

  const handleToggle = useCallback(async () => {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    setIsExpanded(true);

    if (tracksOverride) return;

    // Only fetch if not already cached (null = not fetched, [] = empty)
    if (tracks !== null && !hasError) return;

    setIsLoading(true);
    setHasError(false);
    try {
      const result = await fetchTracks(release.id);
      setTracks(result);
    } catch (error) {
      console.error('Failed to load tracks:', error);
      setTracks(null);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [isExpanded, tracks, hasError, release.id, tracksOverride]);

  if (release.totalTracks === 0) return null;

  return (
    <DrawerSection>
      <button
        type='button'
        onClick={() => {
          handleToggle().catch(() => {});
        }}
        aria-expanded={isExpanded}
        aria-controls={`release-tracklist-${release.id}`}
        className='flex w-full items-center justify-between rounded-[8px] px-2 py-1.5 text-[11px] font-[510] uppercase tracking-[0.08em] text-(--linear-text-tertiary) transition-[background-color,color,box-shadow] duration-150 hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-secondary) focus-visible:bg-(--linear-bg-surface-1) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
      >
        <span>Tracklist ({release.totalTracks})</span>
        {isExpanded ? (
          <ChevronDown className='h-3.5 w-3.5' />
        ) : (
          <ChevronRight className='h-3.5 w-3.5' />
        )}
      </button>

      {isExpanded && (
        <div id={`release-tracklist-${release.id}`} className='space-y-1'>
          {(isLoading || (isFetching && !tracks)) && (
            <div className='space-y-0.5'>
              {(['sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5'] as const)
                .slice(0, Math.min(release.totalTracks, 6))
                .map(id => (
                  <DrawerSurfaceCard
                    key={id}
                    className='flex items-start gap-3 px-2.5 py-2'
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
              className='min-h-[56px] px-3'
              message='Failed to load tracks. Collapse and expand to retry.'
              tone='error'
            />
          )}

          {!isLoading && !hasError && tracks?.length === 0 && (
            <p className='py-2 text-[13px] text-(--linear-text-tertiary)'>
              No track data available.
            </p>
          )}

          {!isLoading &&
            !hasError &&
            tracks &&
            tracks.length > 0 &&
            tracks.map(track => (
              <TrackItem
                key={track.id}
                track={track}
                onClick={onTrackClick}
                playbackState={playbackState}
                onToggleTrack={toggleTrack}
              />
            ))}
        </div>
      )}
    </DrawerSection>
  );
}

function TrackItem({
  track,
  onClick,
  playbackState,
  onToggleTrack,
}: {
  readonly track: ReleaseSidebarTrack;
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
  }) => Promise<void>;
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
  const progressPercent =
    progressDuration > 0
      ? Math.min(
          100,
          Math.max(0, (progressCurrentTime / progressDuration) * 100)
        )
      : 0;

  const handleTogglePlayback = useCallback(() => {
    if (!playableUrl) return;

    onToggleTrack({
      id: track.id,
      title: track.title,
      audioUrl: playableUrl,
    }).catch(() => {
      toast.error('Unable to play this track right now');
    });
  }, [onToggleTrack, playableUrl, track.id, track.title]);

  return (
    <div className='group flex items-start gap-2 rounded-[8px] px-2 py-2 transition-[background-color,box-shadow,border-color] duration-150 hover:bg-(--linear-bg-surface-1) focus-within:bg-(--linear-bg-surface-1) focus-within:shadow-[inset_0_0_0_1px_var(--linear-border-focus)]'>
      {/* Track number */}
      <span className='w-6 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-(--linear-text-tertiary)'>
        {trackLabel}.
      </span>

      <div className='min-w-0 flex-1'>
        <button
          type='button'
          onClick={handleClick}
          className='w-full rounded-[6px] text-left focus-visible:outline-none'
        >
          <div className='flex items-center gap-1.5'>
            <TruncatedText
              lines={1}
              className='text-[13.5px] font-[510] text-(--linear-text-primary)'
              tooltipSide='top'
            >
              {track.title}
            </TruncatedText>
            {track.isExplicit && (
              <Badge
                variant='secondary'
                className='shrink-0 bg-(--linear-bg-surface-1) px-1 py-0 text-[9px] text-(--linear-text-tertiary)'
              >
                E
              </Badge>
            )}
          </div>

          {/* Duration + ISRC row */}
          <div className='mt-0.5 flex items-center gap-2 text-[11px] text-(--linear-text-tertiary)'>
            {track.durationMs != null && (
              <span className='tabular-nums'>
                {formatDuration(track.durationMs)}
              </span>
            )}
            {track.isrc && (
              <>
                {track.durationMs != null && (
                  <span className='text-(--linear-text-quaternary)'>|</span>
                )}
                <span className='font-mono text-[11px]'>{track.isrc}</span>
              </>
            )}
          </div>
        </button>

        {playableUrl && (
          <div className='mt-1.5 space-y-1'>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={event => {
                  event.stopPropagation();
                  handleTogglePlayback();
                }}
                className='flex h-6 w-6 items-center justify-center rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) text-(--linear-text-secondary) transition-[background-color,color,border-color,box-shadow] duration-150 hover:border-(--linear-border-default) hover:bg-(--linear-bg-surface-0) hover:text-(--linear-text-primary) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
                aria-label={isTrackPlaying ? 'Pause preview' : 'Play preview'}
              >
                {isTrackPlaying ? (
                  <Pause className='h-3 w-3' />
                ) : (
                  <Play className='h-3 w-3' />
                )}
              </button>
              <div className='h-1 flex-1 rounded-full bg-(--linear-bg-surface-1)'>
                <div
                  className='h-full rounded-full bg-(--linear-accent) transition-[width]'
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            <p className='text-[10px] text-(--linear-text-tertiary)'>
              {track.audioFormat
                ? `Audio preview · ${track.audioFormat.toUpperCase()}`
                : 'Audio preview'}
            </p>
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
        <button
          type='button'
          className='shrink-0 self-center rounded-[7px] border border-transparent p-1 opacity-60 transition-[opacity,background-color,border-color,color] duration-150 group-hover:opacity-100 focus-visible:opacity-100 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-0) focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-0) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
          aria-label={`Actions for ${track.title}`}
          className='h-[22px] w-[22px] self-center group-hover:opacity-100'
        >
          <MoreHorizontal className='h-4 w-4 text-(--linear-text-tertiary)' />
        </button>
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
