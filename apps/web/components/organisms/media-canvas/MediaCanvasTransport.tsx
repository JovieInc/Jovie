'use client';

import { Button, IconButton } from '@jovie/ui';
import {
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Video,
} from 'lucide-react';
import { SeekBar } from '@/components/molecules/SeekBar';
import type { MediaTransportSnapshot } from '@/components/organisms/audio-chrome-state';
import { formatDuration } from '@/lib/utils/formatDuration';

function formatMediaTime(seconds: number): string {
  return formatDuration(Math.max(0, Math.round(seconds)) * 1000);
}

/** Dock content used by PersistentAudioBar while the canvas owns transport. */
export function MediaCanvasTransport({
  transport,
}: {
  readonly transport: MediaTransportSnapshot;
}) {
  const isVideo = transport.kind === 'video';
  const isPlaying = transport.status === 'playing';
  const isLoading = transport.status === 'loading';
  const hasError = transport.status === 'error';
  const playbackDisabled = !isVideo || hasError;
  const KindIcon = isVideo ? Video : ImageIcon;

  return (
    <section
      aria-label='Media Controls'
      data-testid='media-canvas-transport'
      data-state={hasError ? 'error' : isVideo ? 'populated' : 'disabled'}
      className='flex min-h-16 items-center gap-x-3 px-3 py-2 sm:px-4'
    >
      <div className='hidden min-w-0 items-center gap-2 sm:flex sm:w-1/3'>
        <span className='grid size-8 shrink-0 place-items-center rounded-md bg-surface-1 text-tertiary-token'>
          <KindIcon aria-hidden='true' className='size-4' />
        </span>
        <div className='min-w-0'>
          <p className='truncate text-xs font-caption text-primary-token'>
            {transport.label}
          </p>
          <p className='text-3xs text-tertiary-token'>
            {isVideo ? 'Video' : 'Photo'} · {transport.index + 1} of{' '}
            {transport.itemCount}
          </p>
        </div>
      </div>

      <div className='flex min-w-0 flex-1 flex-col items-center gap-1.5'>
        <div className='flex items-center gap-1.5'>
          <IconButton
            type='button'
            variant='secondary'
            size='sm'
            ariaLabel='Previous media item'
            disabled={!transport.hasPrevious}
            onClick={transport.previous}
          >
            <ChevronLeft aria-hidden='true' />
          </IconButton>
          <IconButton
            type='button'
            variant='control'
            size='md'
            ariaLabel={isPlaying ? 'Pause video' : 'Play video'}
            disabled={playbackDisabled}
            onClick={transport.togglePlayback}
          >
            {isLoading ? (
              <LoaderCircle aria-hidden='true' className='animate-spin' />
            ) : isPlaying ? (
              <Pause aria-hidden='true' fill='currentColor' />
            ) : (
              <Play aria-hidden='true' fill='currentColor' />
            )}
          </IconButton>
          <IconButton
            type='button'
            variant='secondary'
            size='sm'
            ariaLabel='Next media item'
            disabled={!transport.hasNext}
            onClick={transport.next}
          >
            <ChevronRight aria-hidden='true' />
          </IconButton>
        </div>

        <div className='flex w-full min-w-0 items-center gap-2'>
          <span className='w-8 shrink-0 text-right text-3xs tabular-nums text-quaternary-token'>
            {isVideo ? formatMediaTime(transport.currentTime) : '—'}
          </span>
          <SeekBar
            currentTime={transport.currentTime}
            duration={transport.duration}
            onSeek={transport.seek ?? (() => undefined)}
            disabled={!isVideo || isLoading || hasError}
            className='h-1 min-w-15 flex-1 bg-surface-1'
          />
          <span className='w-8 shrink-0 text-3xs tabular-nums text-quaternary-token'>
            {isVideo && transport.duration > 0
              ? formatMediaTime(transport.duration)
              : '—'}
          </span>
        </div>
      </div>

      <div className='flex shrink-0 items-center justify-end'>
        {hasError ? (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={transport.retry}
          >
            <RotateCcw aria-hidden='true' className='size-3.5' />
            Retry
          </Button>
        ) : (
          <span className='text-3xs tabular-nums text-tertiary-token sm:hidden'>
            {transport.index + 1} / {transport.itemCount}
          </span>
        )}
      </div>
    </section>
  );
}
