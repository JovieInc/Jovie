'use client';

import { Button, IconButton, Kbd } from '@jovie/ui';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  LoaderCircle,
  Play,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { EmptyState } from '@/components/molecules/EmptyState';
import {
  type MediaTransportStatus,
  resetMediaCanvasDockHost,
  resetMediaTransportSnapshot,
  setMediaCanvasDockHost,
  setMediaTransportSnapshot,
} from '@/components/organisms/audio-chrome-state';
import { pauseTrackPlayback } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { cn } from '@/lib/utils';

export interface MediaCanvasItem {
  readonly kind: 'image' | 'video';
  readonly src: string;
  readonly poster?: string;
  readonly alt: string;
  readonly label?: string;
}

export interface MediaCanvasViewerProps {
  readonly items: readonly MediaCanvasItem[];
  /** Index of the open item, or null when the viewer is closed. */
  readonly index: number | null;
  readonly onIndexChange: (index: number) => void;
  readonly onClose: () => void;
}

interface MediaPlaybackState {
  readonly key: string;
  readonly status: MediaTransportStatus;
  readonly currentTime: number;
  readonly duration: number;
}

const EMPTY_PLAYBACK_STATE: MediaPlaybackState = {
  key: '',
  status: 'loading',
  currentTime: 0,
  duration: 0,
};

/**
 * Full-canvas photo and video viewer. A native modal dialog owns focus,
 * Escape, and the top layer. PersistentAudioBar portals its ShellAudioDock
 * into this dialog so video and audio never expose competing transports.
 */
export function MediaCanvasViewer({
  items,
  index,
  onIndexChange,
  onClose,
}: MediaCanvasViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ownerId = useId();
  const [attempt, setAttempt] = useState(0);
  const [dockHost, setDockHost] = useState<HTMLDivElement | null>(null);
  const [playback, setPlayback] =
    useState<MediaPlaybackState>(EMPTY_PLAYBACK_STATE);
  const open = index !== null;
  const at = open && items.length > 0 ? Math.min(index, items.length - 1) : 0;
  const current = open ? items[at] : undefined;
  const currentKey = current
    ? `${current.kind}:${current.src}:${attempt}`
    : 'empty';
  const currentPlayback =
    playback.key === currentKey
      ? playback
      : { ...EMPTY_PLAYBACK_STATE, key: currentKey };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    if (!dockHost) return;
    setMediaCanvasDockHost(ownerId, dockHost);
    return () => resetMediaCanvasDockHost(ownerId);
  }, [dockHost, ownerId]);

  useEffect(
    () => () => {
      resetMediaTransportSnapshot(ownerId);
      resetMediaCanvasDockHost(ownerId);
    },
    [ownerId]
  );

  const updatePlayback = useCallback(
    (patch: Partial<Omit<MediaPlaybackState, 'key'>>) => {
      setPlayback(previous => {
        const base =
          previous.key === currentKey
            ? previous
            : { ...EMPTY_PLAYBACK_STATE, key: currentKey };
        return { ...base, ...patch };
      });
    },
    [currentKey]
  );

  const selectIndex = useCallback(
    (next: number) => {
      setAttempt(0);
      onIndexChange(next);
    },
    [onIndexChange]
  );

  const step = useCallback(
    (delta: number) => {
      const next = at + delta;
      if (next >= 0 && next < items.length) selectIndex(next);
    },
    [at, items.length, selectIndex]
  );

  const retry = useCallback(() => {
    setPlayback(EMPTY_PLAYBACK_STATE);
    setAttempt(value => value + 1);
  }, []);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => updatePlayback({ status: 'error' }));
    } else {
      video.pause();
    }
  }, [updatePlayback]);

  const pausePlayback = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const markReady = useCallback(
    () => updatePlayback({ status: 'ready' }),
    [updatePlayback]
  );

  const markError = useCallback(
    () => updatePlayback({ status: 'error' }),
    [updatePlayback]
  );

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(time)) return;
    video.currentTime = Math.max(0, Math.min(time, video.duration || 0));
  }, []);

  useEffect(() => {
    if (!open || !current) {
      resetMediaTransportSnapshot(ownerId);
      return;
    }

    setMediaTransportSnapshot({
      ownerId,
      itemId: currentKey,
      kind: current.kind,
      label: current.label ?? current.alt,
      index: at,
      itemCount: items.length,
      status: currentPlayback.status,
      currentTime: currentPlayback.currentTime,
      duration: currentPlayback.duration,
      hasPrevious: at > 0,
      hasNext: at < items.length - 1,
      togglePlayback: current.kind === 'video' ? togglePlayback : undefined,
      pausePlayback: current.kind === 'video' ? pausePlayback : undefined,
      seek: current.kind === 'video' ? seek : undefined,
      previous: () => step(-1),
      next: () => step(1),
      retry,
    });
  }, [
    at,
    current,
    currentKey,
    currentPlayback.currentTime,
    currentPlayback.duration,
    currentPlayback.status,
    items.length,
    open,
    ownerId,
    pausePlayback,
    retry,
    seek,
    step,
    togglePlayback,
  ]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDialogElement>) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
      }
    },
    [step]
  );

  const mediaPadding = current
    ? 'calc(var(--app-shell-audio-bar-max-height) + var(--app-shell-gap) + var(--space-2))'
    : undefined;

  return (
    <dialog
      ref={dialogRef}
      aria-label={
        current
          ? `${current.alt} (${at + 1} of ${items.length})`
          : 'Media viewer'
      }
      data-testid='media-canvas-viewer'
      onKeyDown={onKeyDown}
      onClose={onClose}
      className='fixed inset-0 m-0 h-dvh max-h-dvh w-dvw max-w-none border-0 bg-black p-0 text-white dark:bg-black dark:text-white backdrop:bg-black/70'
    >
      <div
        className='relative flex h-full flex-col'
        style={{ paddingBottom: mediaPadding }}
      >
        <div className='flex h-12 shrink-0 items-center gap-3 px-3 sm:px-4'>
          <p className='min-w-0 flex-1 truncate text-xs text-white/70'>
            {current?.label ?? current?.alt ?? 'Media preview'}
          </p>
          {current ? (
            <>
              <span className='hidden items-center gap-1 text-3xs text-white/50 sm:flex'>
                <Kbd variant='tooltip'>←</Kbd>
                <Kbd variant='tooltip'>→</Kbd>
                Browse
              </span>
              <span className='text-xs tabular-nums text-white/50'>
                {at + 1} / {items.length}
              </span>
            </>
          ) : null}
          <IconButton
            type='button'
            variant='frosted'
            size='lg'
            onClick={onClose}
            ariaLabel='Close Viewer'
          >
            <X aria-hidden='true' className='size-4' />
          </IconButton>
        </div>

        <div className='relative flex min-h-0 flex-1 items-center justify-center px-12 sm:px-14'>
          {current ? (
            <>
              {current.kind === 'video' ? (
                // biome-ignore lint/a11y/useMediaCaption: evidence recordings have no caption track.
                <video
                  ref={videoRef}
                  key={currentKey}
                  src={current.src}
                  poster={current.poster}
                  autoPlay
                  playsInline
                  tabIndex={-1}
                  aria-label={current.alt}
                  onLoadedMetadata={event =>
                    updatePlayback({
                      currentTime: event.currentTarget.currentTime,
                      duration: Number.isFinite(event.currentTarget.duration)
                        ? event.currentTarget.duration
                        : 0,
                    })
                  }
                  onCanPlay={event =>
                    updatePlayback({
                      status: event.currentTarget.paused ? 'ready' : 'playing',
                    })
                  }
                  onPlaying={() => {
                    pauseTrackPlayback();
                    updatePlayback({ status: 'playing' });
                  }}
                  onPause={() => updatePlayback({ status: 'paused' })}
                  onWaiting={() => updatePlayback({ status: 'loading' })}
                  onTimeUpdate={event =>
                    updatePlayback({
                      currentTime: event.currentTarget.currentTime,
                      duration: Number.isFinite(event.currentTarget.duration)
                        ? event.currentTarget.duration
                        : 0,
                    })
                  }
                  onError={markError}
                  className={cn(
                    'max-h-full max-w-full rounded-md object-contain',
                    currentPlayback.status === 'error' && 'invisible'
                  )}
                />
              ) : (
                <CanvasImage
                  key={currentKey}
                  src={current.src}
                  alt={current.alt}
                  onReady={markReady}
                  onError={markError}
                  className={cn(
                    'relative size-full overflow-hidden rounded-md',
                    currentPlayback.status === 'error' && 'invisible'
                  )}
                />
              )}

              {currentPlayback.status === 'loading' ? (
                <div
                  role='status'
                  className='absolute inset-0 grid place-items-center text-white/70'
                >
                  <span className='flex items-center gap-2 text-sm'>
                    <LoaderCircle
                      aria-hidden='true'
                      className='size-4 animate-spin'
                    />
                    Loading media
                  </span>
                </div>
              ) : null}

              {currentPlayback.status === 'error' ? (
                <EmptyState
                  testId='media-canvas-error'
                  variant='error'
                  icon={<AlertCircle className='size-5' />}
                  heading='Preview Unavailable'
                  description='The media could not be loaded. Try it again.'
                  action={{ label: 'Retry', onClick: retry }}
                  className='dark absolute inset-0'
                />
              ) : null}

              <NavButton
                side='left'
                disabled={at === 0}
                onClick={() => step(-1)}
              />
              <NavButton
                side='right'
                disabled={at === items.length - 1}
                onClick={() => step(1)}
              />
            </>
          ) : (
            <EmptyState
              testId='media-canvas-empty'
              icon={<ImageIcon className='size-5' />}
              heading='No Media Yet'
              description='There are no photos or videos in this preview.'
              action={{ label: 'Close', onClick: onClose }}
              className='dark'
            />
          )}
        </div>

        {items.length > 1 ? (
          <div className='flex h-20 shrink-0 items-center justify-center gap-2 overflow-x-auto px-4'>
            {items.map((item, itemIndex) => (
              <Button
                key={item.src}
                type='button'
                variant='ghost'
                size='icon-xl'
                onClick={() => selectIndex(itemIndex)}
                aria-label={`Show ${item.alt}`}
                aria-current={itemIndex === at || undefined}
              >
                <span
                  className={cn(
                    'relative block size-9 overflow-hidden rounded-md border transition-opacity duration-subtle',
                    itemIndex === at
                      ? 'border-white/80 opacity-100'
                      : 'border-white/10 opacity-50'
                  )}
                >
                  <MediaThumb item={item} />
                </span>
              </Button>
            ))}
          </div>
        ) : null}

        {/* PersistentAudioBar portals the canonical cinematic dock here. */}
        <div
          ref={setDockHost}
          data-testid='media-canvas-dock-host'
          className='absolute inset-x-2 bottom-2 z-20 sm:inset-x-4'
        />

        {/* Warm image neighbours so stepping is instant. */}
        <div hidden>
          {[items[at - 1], items[at + 1]].map(item =>
            item?.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element -- hidden preload of the next evidence frame
              <img key={item.src} src={item.src} alt='' />
            ) : null
          )}
        </div>
      </div>
    </dialog>
  );
}

function CanvasImage({
  src,
  alt,
  className,
  onReady,
  onError,
}: {
  readonly src: string;
  readonly alt: string;
  readonly className?: string;
  readonly onReady: () => void;
  readonly onError: () => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    image.addEventListener('load', onReady);
    image.addEventListener('error', onError);
    if (image.complete && image.naturalWidth > 0) onReady();
    return () => {
      image.removeEventListener('load', onReady);
      image.removeEventListener('error', onError);
    };
  }, [onError, onReady]);

  return (
    <div className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element -- evidence URLs are arbitrary and must not be resampled */}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className='size-full object-contain'
      />
    </div>
  );
}

function NavButton({
  side,
  disabled,
  onClick,
}: {
  readonly side: 'left' | 'right';
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <IconButton
      type='button'
      variant='frosted'
      size='lg'
      onClick={onClick}
      disabled={disabled}
      ariaLabel={side === 'left' ? 'Previous' : 'Next'}
      className={cn(
        'absolute top-1/2 -translate-y-1/2',
        side === 'left' ? 'left-2 sm:left-3' : 'right-2 sm:right-3'
      )}
    >
      <Icon aria-hidden='true' className='size-5' />
    </IconButton>
  );
}

/** Thumbnail with a play badge for video; shared by the viewer and callers. */
export function MediaThumb({
  item,
  fit = 'cover',
}: {
  readonly item: MediaCanvasItem;
  /** `contain` shows the whole frame (hero previews); `cover` fills (strips). */
  readonly fit?: 'cover' | 'contain';
}) {
  const still = item.kind === 'video' ? item.poster : item.src;
  return (
    <>
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnails of arbitrary evidence URLs
        <img
          src={still}
          alt=''
          loading='lazy'
          className={cn(
            'size-full',
            fit === 'contain' ? 'object-contain' : 'object-cover'
          )}
        />
      ) : (
        <span className='block size-full bg-white/5' />
      )}
      {item.kind === 'video' ? (
        <span className='absolute inset-0 grid place-items-center'>
          <span className='grid size-6 place-items-center rounded-full bg-black/60'>
            <Play
              className='size-3 fill-white text-white dark:text-white'
              aria-hidden='true'
            />
          </span>
        </span>
      ) : null}
    </>
  );
}
