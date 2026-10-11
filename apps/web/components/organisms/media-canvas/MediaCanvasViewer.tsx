'use client';

import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SeekBar } from '@/components/atoms/SeekBar';
import {
  mediaCanvasTransport,
  publishMediaCanvasTransport,
  registerMediaCanvasTransport,
  useMediaCanvasTransport,
} from '@/components/organisms/audio-chrome-state';
import {
  pausePlaybackForInterruption,
  resumePlaybackAfterInterruption,
} from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';

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

interface VideoPlaybackState {
  readonly isPlaying: boolean;
  readonly currentTime: number;
  readonly duration: number;
}

const IDLE_VIDEO_STATE: VideoPlaybackState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
};

/**
 * Full-canvas photo and video viewer. A native modal <dialog> gives focus
 * containment, Escape and the top layer; ←/→ step through items and the
 * filmstrip jumps. While open, the viewer registers as the media transport
 * owner on `audio-chrome-state` (JOV-7240): the shell audio dock renders
 * play/pause, scrub, time and next/previous for the canvas, and starting a
 * video pauses the audio track so there is only ever one playback owner.
 */
export function MediaCanvasViewer({
  items,
  index,
  onIndexChange,
  onClose,
}: MediaCanvasViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioHoldRef = useRef(false);
  const [videoState, setVideoState] =
    useState<VideoPlaybackState>(IDLE_VIDEO_STATE);
  const open = index !== null && items.length > 0;
  const current = open ? items[Math.min(index, items.length - 1)] : undefined;
  const at = open ? Math.min(index, items.length - 1) : 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const step = useCallback(
    (delta: number) => {
      const next = at + delta;
      if (next >= 0 && next < items.length) onIndexChange(next);
    },
    [at, items.length, onIndexChange]
  );

  // The dock's transport commands act on the current item regardless of when
  // they fire, so the controller reads through a ref that always points at
  // the latest step/element.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const toggleVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  // Register the canvas as the dock's transport owner for as long as it is
  // open — photos included, so dock next/previous steps through every item.
  useEffect(() => {
    if (!open) return;
    return registerMediaCanvasTransport({
      toggle: () => toggleVideo(),
      seek: time => {
        const video = videoRef.current;
        if (!video || !Number.isFinite(time)) return;
        if (!Number.isFinite(video.duration) || video.duration === 0) return;
        video.currentTime = Math.max(0, Math.min(time, video.duration));
      },
      next: () => stepRef.current(1),
      previous: () => stepRef.current(-1),
    });
  }, [open, toggleVideo]);

  // Wire the current video element to the transport: element events publish
  // playback state, and `play` takes an audio-interruption hold so the shell
  // track pauses while a canvas video owns playback (no auto-resume).
  useEffect(() => {
    const video = videoRef.current;
    if (!open || !current || current.kind !== 'video' || !video) {
      setVideoState(IDLE_VIDEO_STATE);
      return;
    }

    const releaseHold = () => {
      if (!audioHoldRef.current) return;
      audioHoldRef.current = false;
      resumePlaybackAfterInterruption();
    };
    const sync = () =>
      setVideoState({
        isPlaying: !video.paused && !video.ended,
        currentTime: video.currentTime,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      });
    const onPlay = () => {
      if (!audioHoldRef.current) {
        audioHoldRef.current = true;
        pausePlaybackForInterruption();
      }
      sync();
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', releaseHold);
    video.addEventListener('ended', releaseHold);
    video.addEventListener('pause', sync);
    video.addEventListener('ended', sync);
    video.addEventListener('timeupdate', sync);
    video.addEventListener('durationchange', sync);
    video.addEventListener('loadedmetadata', sync);
    sync();
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', releaseHold);
      video.removeEventListener('ended', releaseHold);
      video.removeEventListener('pause', sync);
      video.removeEventListener('ended', sync);
      video.removeEventListener('timeupdate', sync);
      video.removeEventListener('durationchange', sync);
      video.removeEventListener('loadedmetadata', sync);
      releaseHold();
      setVideoState(IDLE_VIDEO_STATE);
    };
  }, [open, current]);

  // Publish the transport snapshot the dock renders.
  useEffect(() => {
    if (!open || !current) return;
    publishMediaCanvasTransport({
      title: current.label ?? current.alt,
      index: at,
      count: items.length,
      isVideo: current.kind === 'video',
      isPlaying: videoState.isPlaying,
      currentTime: videoState.currentTime,
      duration: videoState.duration,
      hasNext: at < items.length - 1,
      hasPrevious: at > 0,
    });
  }, [open, current, at, items.length, videoState]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDialogElement>) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
      } else if (event.key === ' ' && current?.kind === 'video') {
        // Claim Space for the canvas video so the shell's global audio
        // shortcut (which respects defaultPrevented) does not resume the
        // paused track — one playback owner at a time.
        event.preventDefault();
        toggleVideo();
      }
    },
    [current?.kind, step, toggleVideo]
  );

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
      {current ? (
        <div className='flex h-full flex-col'>
          <div className='flex h-12 shrink-0 items-center gap-3 px-4'>
            <p className='min-w-0 flex-1 truncate text-xs text-white/70'>
              {current.label ?? current.alt}
            </p>
            <span className='text-xs tabular-nums text-white/50'>
              {at + 1} / {items.length}
            </span>
            <button
              type='button'
              onClick={onClose}
              aria-label='Close Viewer'
              className='group grid size-11 place-items-center rounded-full text-white/70 hover:text-white focus-visible:outline-none'
            >
              <span className='grid size-8 place-items-center rounded-full group-hover:bg-white/10 group-focus-visible:ring-2 group-focus-visible:ring-white/40'>
                <X className='size-4' aria-hidden='true' />
              </span>
            </button>
          </div>

          <div className='relative flex min-h-0 flex-1 items-center justify-center px-14'>
            {current.kind === 'video' ? (
              // biome-ignore lint/a11y/useMediaCaption: evidence recordings have no caption track.
              <video
                key={current.src}
                ref={videoRef}
                src={current.src}
                poster={current.poster}
                autoPlay
                playsInline
                className='max-h-full max-w-full rounded-md'
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- full-resolution evidence; next/image would resample it
              <img
                key={current.src}
                src={current.src}
                alt={current.alt}
                className='max-h-full max-w-full rounded-md object-contain'
              />
            )}
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
          </div>

          {current.kind === 'video' ? <CanvasTransportBar /> : null}

          {items.length > 1 ? (
            <div className='flex h-20 shrink-0 items-center justify-center gap-2 overflow-x-auto px-4'>
              {items.map((item, i) => (
                <button
                  key={item.src}
                  type='button'
                  onClick={() => onIndexChange(i)}
                  aria-label={`Show ${item.alt}`}
                  aria-current={i === at || undefined}
                  className={cn(
                    'relative h-12 w-20 shrink-0 overflow-hidden rounded-md border transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                    i === at
                      ? 'border-white/80 opacity-100'
                      : 'border-white/10 opacity-50 hover:opacity-80'
                  )}
                >
                  <MediaThumb item={item} />
                </button>
              ))}
            </div>
          ) : null}

          {/* Warm the neighbours so stepping is instant. */}
          <div hidden>
            {[items[at - 1], items[at + 1]].map(item =>
              item?.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element -- hidden preload of the next evidence frame
                <img key={item.src} src={item.src} alt='' />
              ) : null
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * In-canvas transport for the video item — the same state the shell audio
 * dock renders, driven through `audio-chrome-state` so dock buttons and this
 * row never disagree.
 */
function CanvasTransportBar() {
  const transport = useMediaCanvasTransport();
  if (!transport) return null;

  const elapsed = formatDuration(Math.round(transport.currentTime) * 1000);
  const total =
    transport.duration > 0
      ? formatDuration(Math.round(transport.duration) * 1000)
      : null;

  return (
    <section
      data-testid='media-canvas-transport'
      aria-label='Media Transport'
      className='flex h-14 shrink-0 items-center gap-3 px-4 sm:px-6'
    >
      <button
        type='button'
        onClick={() => mediaCanvasTransport.previous()}
        disabled={!transport.hasPrevious}
        aria-label='Previous Item'
        className='grid size-11 shrink-0 place-items-center rounded-full text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-30'
      >
        <SkipBack className='size-4' aria-hidden='true' fill='currentColor' />
      </button>
      <button
        type='button'
        onClick={() => mediaCanvasTransport.toggle()}
        aria-label={transport.isPlaying ? 'Pause video' : 'Play video'}
        className='grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 dark:text-white'
      >
        {transport.isPlaying ? (
          <Pause className='size-4' aria-hidden='true' fill='currentColor' />
        ) : (
          <Play
            className='size-4 translate-x-px'
            aria-hidden='true'
            fill='currentColor'
          />
        )}
      </button>
      <button
        type='button'
        onClick={() => mediaCanvasTransport.next()}
        disabled={!transport.hasNext}
        aria-label='Next Item'
        className='grid size-11 shrink-0 place-items-center rounded-full text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-30'
      >
        <SkipForward
          className='size-4'
          aria-hidden='true'
          fill='currentColor'
        />
      </button>
      <span className='w-9 shrink-0 text-right text-3xs tabular-nums text-white/50'>
        {elapsed}
      </span>
      <SeekBar
        currentTime={transport.currentTime}
        duration={transport.duration}
        onSeek={time => mediaCanvasTransport.seek(time)}
        className='h-1 min-w-10 flex-1 bg-white/15'
      />
      <span className='w-9 shrink-0 text-3xs tabular-nums text-white/50'>
        {total}
      </span>
    </section>
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
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      className={cn(
        'group absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-white/80 hover:text-white focus-visible:outline-none disabled:opacity-0',
        side === 'left' ? 'left-3' : 'right-3'
      )}
    >
      <span className='grid size-10 place-items-center rounded-full bg-white/8 group-hover:bg-white/15 group-focus-visible:ring-2 group-focus-visible:ring-white/40'>
        <Icon className='size-5' aria-hidden='true' />
      </span>
    </button>
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
