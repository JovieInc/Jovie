'use client';

import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ArtworkPlayOverlay — small play/pause button overlaid on album art.
 *
 * Shared between `SidebarNowPlaying` and `SidebarBottomNowPlaying`. Hidden
 * by default; the parent toggles `visible` based on context (e.g. when
 * the audio bar is collapsed and the artwork becomes the primary
 * playback affordance).
 *
 * When hidden, the overlay is opacity-0 AND pointer-events-none so the
 * artwork click area below isn't silently shadowed by an invisible button.
 */
export function ArtworkPlayOverlay({
  isPlaying,
  onPlay,
  visible,
  className,
}: {
  readonly isPlaying: boolean;
  readonly onPlay: () => void;
  readonly visible: boolean;
  readonly className?: string;
}) {
  return (
    <button
      type='button'
      onClick={onPlay}
      className={cn(
        'absolute inset-0 grid place-items-center bg-black/50 text-white transition-opacity duration-150 ease-out hover:opacity-100',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
        className
      )}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      tabIndex={visible ? 0 : -1}
    >
      {isPlaying ? <Pause className='h-4 w-4' /> : <Play className='h-4 w-4' />}
    </button>
  );
}
