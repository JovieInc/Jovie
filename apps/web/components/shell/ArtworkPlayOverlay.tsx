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
        visible ? 'opacity-100' : 'opacity-0',
        className
      )}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      tabIndex={visible ? 0 : -1}
    >
      {isPlaying ? (
        <Pause className='h-3.5 w-3.5' />
      ) : (
        <Play className='h-3.5 w-3.5' />
      )}
    </button>
  );
}
