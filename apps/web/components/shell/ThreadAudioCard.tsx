'use client';

import { Disc3, Play } from 'lucide-react';

export interface ThreadAudioCardProps {
  readonly title: string;
  readonly artist: string;
  readonly duration: string;
  readonly onPlay?: () => void;
}

/**
 * Minimal audio card. Click play hands the track off to the global audio
 * bar at the bottom of the canvas (callers wire that up via `onPlay`).
 * Inline play/pause is intentionally one-shot — the global bar is the
 * single source of truth for playback state.
 */
export function ThreadAudioCard({
  title,
  artist,
  duration,
  onPlay,
}: ThreadAudioCardProps) {
  return (
    <div className='flex items-center gap-3 rounded-xl border border-(--linear-app-shell-border) bg-(--surface-0)/40 px-3 py-2.5'>
      <div className='shrink-0 h-10 w-10 rounded bg-(--surface-2) grid place-items-center'>
        <Disc3 className='h-4 w-4 text-tertiary-token' strokeWidth={2.25} />
      </div>
      <div className='flex-1 min-w-0'>
        <p className='text-[12.5px] font-medium text-primary-token truncate'>
          {title}
        </p>
        <p className='text-[11px] text-tertiary-token truncate'>
          {artist} · {duration}
        </p>
      </div>
      <button
        type='button'
        onClick={onPlay}
        className='h-8 w-8 rounded-full grid place-items-center bg-white text-black hover:bg-white/90 transition-colors duration-150 ease-out'
        aria-label='Play in global player'
      >
        <Play
          className='h-3 w-3 translate-x-px'
          strokeWidth={2.5}
          fill='currentColor'
        />
      </button>
    </div>
  );
}
