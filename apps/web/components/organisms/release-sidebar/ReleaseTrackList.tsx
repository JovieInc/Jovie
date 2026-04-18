'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import {
  CheckCircle2,
  ChevronDown,
  Download,
  History,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';
import { DrawerEmptyState } from '@/components/molecules/drawer';
import type { ReleaseSidebarTrack } from '@/lib/discography/types';
import { useReleaseTracksQuery } from '@/lib/queries';
import {
  fetchWithTimeout,
  fetchWithTimeoutResponse,
} from '@/lib/queries/fetch';
import type { TrackCanvasHistory } from '@/lib/services/canvas/types';
import { cn } from '@/lib/utils';
import { downloadBlob } from '@/lib/utils/download';
import { formatDuration } from '@/lib/utils/formatDuration';
import type { Release } from './types';
import { useTrackAudioPlayer } from './useTrackAudioPlayer';

interface ReleaseTrackListProps {
  readonly release: Release;
  readonly tracksOverride?: ReleaseSidebarTrack[];
  readonly canGenerateCanvas?: boolean;
}

interface TrackControlSource {
  readonly id: string;
  readonly title: string;
  readonly audioUrl?: string;
  readonly isrc?: string | null;
  readonly releaseTitle?: string;
  readonly artistName?: string;
  readonly artworkUrl?: string | null;
}

function getCanonicalTrackLabel(track: ReleaseSidebarTrack): string {
  return track.discNumber > 1
    ? `${track.discNumber}-${track.trackNumber}`
    : String(track.trackNumber);
}

function getTrackCanvasId(track: ReleaseSidebarTrack): string {
  return track.releaseTrackId ?? track.id;
}

function getPrimaryCanvasLabel(track: ReleaseSidebarTrack): string {
  switch (track.canvas?.status) {
    case 'queued':
    case 'processing':
      return 'Generating…';
    case 'ready':
    case 'uploaded':
      return 'Download';
    case 'failed':
      return 'Retry';
    default:
      return 'Generate';
  }
}

function getCanvasStatusLabel(track: ReleaseSidebarTrack): string {
  switch (track.canvas?.status) {
    case 'queued':
      return 'Queued';
    case 'processing':
      return 'Processing';
    case 'ready':
      return 'Ready';
    case 'uploaded':
      return 'Uploaded';
    case 'failed':
      return 'Failed';
    default:
      return 'Not set';
  }
}

function sanitizeFilename(value: string): string {
  return (
    value
      .replaceAll(/[^a-zA-Z0-9\s-]/g, '')
      .trim()
      .replaceAll(/\s+/g, '-')
      .toLowerCase() || 'spotify-canvas'
  );
}

function getDisplayTrackLabel(params: {
  track: ReleaseSidebarTrack;
  index: number;
  isSingleDiscPartialSubset: boolean;
}): string {
  const { track, index, isSingleDiscPartialSubset } = params;
  if (isSingleDiscPartialSubset) {
    return String(index + 1);
  }

  return getCanonicalTrackLabel(track);
}

export function ReleaseTrackList({
  release,
  tracksOverride,
  canGenerateCanvas = false,
}: ReleaseTrackListProps) {
  const { playbackState, toggleTrack } = useTrackAudioPlayer();
  const {
    data: fetchedTracks,
    isLoading,
    isFetching,
    isError: hasError,
    refetch,
  } = useReleaseTracksQuery(
    release.id,
    !tracksOverride && release.totalTracks > 0
  );
  const tracks = tracksOverride ?? fetchedTracks;
  const [historyTrack, setHistoryTrack] = useState<ReleaseSidebarTrack | null>(
    null
  );
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  const invalidateCanvasData = useCallback(() => {
    startTransition(() => {
      if (!tracksOverride) {
        void refetch();
      }
    });
  }, [refetch, tracksOverride]);

  const handleGenerateAll = useCallback(async () => {
    if (!canGenerateCanvas || isGeneratingAll) {
      return;
    }

    setIsGeneratingAll(true);
    try {
      await fetchWithTimeout('/api/canvas/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseId: release.id }),
      });
      toast.success('Canvas generation started for this release');
      invalidateCanvasData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate Canvases';
      toast.error(message);
    } finally {
      setIsGeneratingAll(false);
    }
  }, [canGenerateCanvas, invalidateCanvasData, isGeneratingAll, release.id]);

  let liveAnnouncement = '';
  if (playbackState.playbackStatus === 'error') {
    liveAnnouncement = 'Preview unavailable.';
  } else if (
    playbackState.playbackStatus === 'playing' &&
    playbackState.trackTitle
  ) {
    liveAnnouncement = `Now playing ${playbackState.trackTitle}.`;
  } else if (playbackState.playbackStatus === 'paused') {
    liveAnnouncement = 'Playback paused.';
  }

  if (release.totalTracks === 0) return null;

  if (isLoading || (isFetching && !tracks)) {
    return (
      <div className='space-y-1' data-testid='tracklist'>
        {Array.from(
          { length: Math.min(release.totalTracks, 6) },
          (_, index) => `sk${index}`
        ).map(id => (
          <div
            key={id}
            className='flex items-center gap-3 rounded-[12px] px-1 py-2.5'
            data-testid='release-track-skeleton'
          >
            <div className='h-8 w-8 rounded-full skeleton' />
            <div className='min-w-0 flex-1 space-y-1.5'>
              <div className='h-4 w-1/2 rounded skeleton' />
              <div className='h-3 w-16 rounded skeleton' />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (hasError) {
    return (
      <DrawerEmptyState
        className='min-h-[48px] px-0'
        message='Failed to load tracks.'
        tone='error'
      />
    );
  }

  if (!tracks || tracks.length === 0) {
    return (
      <DrawerEmptyState
        className='min-h-[48px] px-0'
        message='No track data available.'
      />
    );
  }

  const inferredDiscCount = Math.max(
    1,
    ...tracks.map(track => track.discNumber)
  );
  const isSingleDiscPartialSubset =
    tracks.length < release.totalTracks &&
    (release.totalDiscs ?? inferredDiscCount) === 1;

  return (
    <>
      <div className='space-y-1' data-testid='tracklist'>
        <p className='sr-only' aria-live='polite'>
          {liveAnnouncement}
        </p>
        {canGenerateCanvas ? (
          <div className='flex items-center justify-end py-1'>
            <button
              type='button'
              onClick={handleGenerateAll}
              disabled={isGeneratingAll}
              className='inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-0 px-3 py-1.5 text-[11px] font-[510] text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token disabled:cursor-not-allowed disabled:opacity-60'
            >
              {isGeneratingAll ? (
                <LoaderCircle className='h-3.5 w-3.5 animate-spin' />
              ) : (
                <Sparkles className='h-3.5 w-3.5' />
              )}
              <span>Generate All Canvases</span>
            </button>
          </div>
        ) : null}
        {tracks.map((track, index) => (
          <TrackListRow
            key={track.releaseTrackId ?? track.id}
            track={track}
            trackLabel={getDisplayTrackLabel({
              track,
              index,
              isSingleDiscPartialSubset,
            })}
            release={release}
            playbackState={playbackState}
            onToggleTrack={toggleTrack}
            isLastRow={index === tracks.length - 1}
            canGenerateCanvas={canGenerateCanvas}
            onOpenHistory={() => setHistoryTrack(track)}
            onInvalidateCanvasData={invalidateCanvasData}
          />
        ))}
      </div>
      <TrackCanvasHistoryDialog
        release={release}
        track={historyTrack}
        open={Boolean(historyTrack)}
        onOpenChange={open => {
          if (!open) {
            setHistoryTrack(null);
          }
        }}
        onInvalidateCanvasData={invalidateCanvasData}
      />
    </>
  );
}

function TrackListRow({
  track,
  trackLabel,
  release,
  playbackState,
  onToggleTrack,
  isLastRow,
  canGenerateCanvas,
  onOpenHistory,
  onInvalidateCanvasData,
}: {
  readonly track: ReleaseSidebarTrack;
  readonly trackLabel: string;
  readonly release: Release;
  readonly playbackState: {
    activeTrackId: string | null;
    isPlaying: boolean;
    playbackStatus?: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  };
  readonly onToggleTrack: (track: TrackControlSource) => Promise<void>;
  readonly isLastRow: boolean;
  readonly canGenerateCanvas: boolean;
  readonly onOpenHistory: () => void;
  readonly onInvalidateCanvasData: () => void;
}) {
  const playableUrl = track.audioUrl ?? track.previewUrl ?? undefined;
  const isActiveTrack = playbackState.activeTrackId === track.id;
  const isTrackPlaying = isActiveTrack && playbackState.isPlaying;
  const trackDuration =
    track.durationMs == null ? null : formatDuration(track.durationMs);
  const [isActionPending, setIsActionPending] = useState(false);
  const trackCanvasId = getTrackCanvasId(track);
  const primaryCanvasLabel = getPrimaryCanvasLabel(track);
  const canvasStatusLabel = getCanvasStatusLabel(track);

  const handleTogglePlayback = useCallback(() => {
    if (isActiveTrack) {
      onToggleTrack({
        id: track.id,
        title: track.title,
      }).catch(() => {
        toast.error('Unable to control playback right now');
      });
      return;
    }

    if (!playableUrl) {
      return;
    }

    onToggleTrack({
      id: track.id,
      title: track.title,
      audioUrl: playableUrl,
      isrc: track.isrc,
      releaseTitle: release.title,
      artistName: release.artistNames?.[0],
      artworkUrl: release.artworkUrl,
    }).catch(() => {
      toast.error('Unable to play this track right now');
    });
  }, [
    isActiveTrack,
    onToggleTrack,
    playableUrl,
    release.artistNames,
    release.artworkUrl,
    release.title,
    track.id,
    track.isrc,
    track.title,
  ]);

  const runCanvasAction = useCallback(
    async (task: () => Promise<void>) => {
      if (isActionPending) {
        return;
      }

      setIsActionPending(true);
      try {
        await task();
        onInvalidateCanvasData();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Canvas action failed';
        toast.error(message);
      } finally {
        setIsActionPending(false);
      }
    },
    [isActionPending, onInvalidateCanvasData]
  );

  const handleGenerate = useCallback(() => {
    void runCanvasAction(async () => {
      await fetchWithTimeout('/api/canvas/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: trackCanvasId }),
      });
      toast.success('Canvas generation started');
    });
  }, [runCanvasAction, trackCanvasId]);

  const handleDownload = useCallback(
    (generationId?: string) => {
      if (!generationId) {
        toast.error('No Canvas is ready to download yet');
        return;
      }

      void runCanvasAction(async () => {
        const response = await fetchWithTimeoutResponse(
          `/api/dashboard/tracks/${encodeURIComponent(trackCanvasId)}/canvas/${encodeURIComponent(generationId)}/download`
        );
        const blob = await response.blob();
        downloadBlob(
          blob,
          `${sanitizeFilename(track.title)}-spotify-canvas.mp4`
        );
      });
    },
    [runCanvasAction, track.title, trackCanvasId]
  );

  const handleMarkUploaded = useCallback(() => {
    const generationId = track.canvas?.currentGenerationId;
    if (!generationId) {
      toast.error('Generate a Canvas before marking it uploaded');
      return;
    }

    void runCanvasAction(async () => {
      await fetchWithTimeout(
        `/api/dashboard/tracks/${encodeURIComponent(trackCanvasId)}/canvas/${encodeURIComponent(generationId)}/mark-uploaded`,
        { method: 'POST' }
      );
      toast.success('Canvas marked as uploaded');
    });
  }, [runCanvasAction, track.canvas?.currentGenerationId, trackCanvasId]);

  const handlePrimaryCanvasAction = useCallback(() => {
    switch (track.canvas?.status) {
      case 'ready':
      case 'uploaded':
        handleDownload(track.canvas.currentGenerationId);
        return;
      case 'queued':
      case 'processing':
        return;
      default:
        handleGenerate();
    }
  }, [handleDownload, handleGenerate, track.canvas]);

  function getControlLabel(): string {
    if (!playableUrl && !isActiveTrack) {
      return `No preview available for ${track.title}`;
    }

    return isTrackPlaying ? `Pause ${track.title}` : `Play ${track.title}`;
  }

  const controlLabel = getControlLabel();

  let trackButtonContent: React.JSX.Element;
  if (isActiveTrack && isTrackPlaying) {
    trackButtonContent = <Pause className='h-3.5 w-3.5' aria-hidden='true' />;
  } else if (isActiveTrack) {
    trackButtonContent = (
      <Play className='h-3.5 w-3.5 translate-x-px' aria-hidden='true' />
    );
  } else {
    trackButtonContent = <span aria-hidden='true'>{trackLabel}</span>;
  }

  const canvasButtonDisabled =
    !canGenerateCanvas ||
    isActionPending ||
    track.canvas?.status === 'queued' ||
    track.canvas?.status === 'processing';

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2.5',
        !isLastRow &&
          'border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_58%,transparent)]'
      )}
      data-testid={`release-track-row-${track.id}`}
    >
      <button
        type='button'
        onClick={handleTogglePlayback}
        disabled={!playableUrl && !isActiveTrack}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-[510] tabular-nums transition-[background-color,color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
          isActiveTrack
            ? 'border border-(--linear-app-frame-seam) bg-surface-0 text-primary-token hover:bg-surface-1'
            : 'border border-transparent bg-transparent text-tertiary-token hover:bg-surface-0 hover:text-primary-token',
          !playableUrl &&
            !isActiveTrack &&
            'cursor-not-allowed text-quaternary-token hover:bg-transparent hover:text-quaternary-token'
        )}
        aria-label={controlLabel}
        data-testid={`release-track-control-${track.id}`}
      >
        {trackButtonContent}
      </button>

      <div className='min-w-0 flex-1'>
        <p className='truncate text-[12.5px] font-[510] leading-tight text-primary-token'>
          {track.title}
        </p>
        {track.canvas ? (
          <p className='mt-0.5 text-[10.5px] leading-[14px] text-tertiary-token'>
            Canvas {canvasStatusLabel}
          </p>
        ) : null}
      </div>

      {canGenerateCanvas ? (
        <div className='flex shrink-0 items-center gap-2'>
          <button
            type='button'
            onClick={handlePrimaryCanvasAction}
            disabled={canvasButtonDisabled}
            className='inline-flex h-8 items-center gap-1.5 rounded-full border border-subtle bg-surface-0 px-3 text-[11px] font-[510] text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token disabled:cursor-not-allowed disabled:opacity-60'
          >
            {isActionPending ||
            track.canvas?.status === 'queued' ||
            track.canvas?.status === 'processing' ? (
              <LoaderCircle className='h-3.5 w-3.5 animate-spin' />
            ) : track.canvas?.status === 'ready' ||
              track.canvas?.status === 'uploaded' ? (
              <Download className='h-3.5 w-3.5' />
            ) : track.canvas?.status === 'failed' ? (
              <RefreshCw className='h-3.5 w-3.5' />
            ) : (
              <Sparkles className='h-3.5 w-3.5' />
            )}
            <span>{primaryCanvasLabel}</span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type='button'
                className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
                aria-label={`Set Canvas options for ${track.title}`}
              >
                <ChevronDown className='h-3.5 w-3.5' />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-52'>
              <DropdownMenuItem
                onClick={handleGenerate}
                disabled={isActionPending}
              >
                <Sparkles className='mr-2 h-3.5 w-3.5' />
                {track.canvas?.currentGenerationId ? 'Regenerate' : 'Generate'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  handleDownload(track.canvas?.currentGenerationId)
                }
                disabled={!track.canvas?.currentGenerationId || isActionPending}
              >
                <Download className='mr-2 h-3.5 w-3.5' />
                Download Current
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenHistory}>
                <History className='mr-2 h-3.5 w-3.5' />
                View History
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleMarkUploaded}
                disabled={!track.canvas?.currentGenerationId || isActionPending}
              >
                <CheckCircle2 className='mr-2 h-3.5 w-3.5' />
                Mark Uploaded
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      {trackDuration ? (
        <span className='shrink-0 text-[11px] tabular-nums text-tertiary-token'>
          {trackDuration}
        </span>
      ) : null}
    </div>
  );
}

function TrackCanvasHistoryDialog({
  release,
  track,
  open,
  onOpenChange,
  onInvalidateCanvasData,
}: {
  readonly release: Release;
  readonly track: ReleaseSidebarTrack | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onInvalidateCanvasData: () => void;
}) {
  const trackCanvasId = track ? getTrackCanvasId(track) : null;
  const [data, setData] = useState<TrackCanvasHistory | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open || !trackCanvasId) {
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    void fetchWithTimeout<TrackCanvasHistory>(
      `/api/dashboard/tracks/${encodeURIComponent(trackCanvasId)}/canvas`,
      { signal: controller.signal }
    )
      .then(history => {
        setData(history);
      })
      .catch(error => {
        const message =
          error instanceof Error ? error.message : 'Failed to load history';
        toast.error(message);
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [open, trackCanvasId]);

  const runHistoryAction = useCallback(
    async <T,>(task: () => Promise<T>) => {
      try {
        const result = await task();
        onInvalidateCanvasData();
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Canvas action failed';
        toast.error(message);
      }
    },
    [onInvalidateCanvasData]
  );

  const handleDownloadGeneration = useCallback(
    async (generationId: string) => {
      if (!track) return;
      const response = await fetchWithTimeoutResponse(
        `/api/dashboard/tracks/${encodeURIComponent(getTrackCanvasId(track))}/canvas/${encodeURIComponent(generationId)}/download`
      );
      const blob = await response.blob();
      downloadBlob(
        blob,
        `${sanitizeFilename(track.title)}-${generationId.slice(0, 8)}.mp4`
      );
    },
    [track]
  );

  const rows = useMemo(() => data?.generations ?? [], [data?.generations]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-[620px]'>
        <DialogHeader>
          <DialogTitle>
            {track ? `${track.title} Canvas History` : 'Canvas History'}
          </DialogTitle>
          <DialogDescription>
            Download, select, or mark a previous Canvas version for this track.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className='space-y-2'>
            <div className='h-12 rounded-xl skeleton' />
            <div className='h-12 rounded-xl skeleton' />
            <div className='h-12 rounded-xl skeleton' />
          </div>
        ) : rows.length === 0 ? (
          <DrawerEmptyState
            className='min-h-[120px]'
            message='No Canvas generations yet.'
          />
        ) : (
          <div className='space-y-2'>
            {rows.map(generation => {
              const isCurrent = data?.currentGenerationId === generation.id;
              const isUploaded = data?.uploadedGenerationId === generation.id;

              return (
                <div
                  key={generation.id}
                  className='flex items-center justify-between gap-3 rounded-[14px] border border-subtle bg-surface-0 px-3 py-2.5'
                >
                  <div className='min-w-0 flex-1'>
                    <p className='text-[11.5px] font-[510] text-primary-token'>
                      {generation.provider} / {generation.model}
                    </p>
                    <p className='mt-0.5 text-[10.5px] text-tertiary-token'>
                      {new Date(generation.createdAt).toLocaleString()} ·{' '}
                      {generation.status} · {generation.durationSec}s
                      {isCurrent ? ' · Current' : ''}
                      {isUploaded ? ' · Uploaded' : ''}
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    <button
                      type='button'
                      onClick={() =>
                        void runHistoryAction(() =>
                          handleDownloadGeneration(generation.id)
                        )
                      }
                      className='inline-flex h-8 items-center rounded-full border border-subtle px-3 text-[10.5px] font-[510] text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
                    >
                      Download
                    </button>
                    {!isCurrent ? (
                      <button
                        type='button'
                        onClick={() =>
                          void runHistoryAction(async () => {
                            if (!track) return;
                            const response = await fetchWithTimeout<{
                              success: boolean;
                              history: TrackCanvasHistory;
                            }>(
                              `/api/dashboard/tracks/${encodeURIComponent(getTrackCanvasId(track))}/canvas/${encodeURIComponent(generation.id)}/select`,
                              { method: 'POST' }
                            );
                            setData(response.history);
                          })
                        }
                        className='inline-flex h-8 items-center rounded-full border border-subtle px-3 text-[10.5px] font-[510] text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
                      >
                        Set Current
                      </button>
                    ) : null}
                    {!isUploaded ? (
                      <button
                        type='button'
                        onClick={() =>
                          void runHistoryAction(async () => {
                            if (!track) return;
                            const response = await fetchWithTimeout<{
                              success: boolean;
                              history: TrackCanvasHistory;
                            }>(
                              `/api/dashboard/tracks/${encodeURIComponent(getTrackCanvasId(track))}/canvas/${encodeURIComponent(generation.id)}/mark-uploaded`,
                              { method: 'POST' }
                            );
                            setData(response.history);
                          })
                        }
                        className='inline-flex h-8 items-center rounded-full border border-subtle px-3 text-[10.5px] font-[510] text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
                      >
                        Mark Uploaded
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
