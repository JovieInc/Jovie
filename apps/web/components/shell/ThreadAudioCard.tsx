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
 *
 * The play button is disabled when no `onPlay` handler is supplied so
 * the UI never advertises an action that does nothing.
 */
export function ThreadAudioCard({
  title,
  artist,
  duration,
  onPlay,
}: ThreadAudioCardProps) {
  return (
    <div className='system-b-thread-media-card system-b-thread-audio-card'>
      <div className='system-b-thread-audio-artwork'>
        <Disc3 className='h-4 w-4 text-tertiary-token' strokeWidth={2.25} />
      </div>
      <div className='system-b-thread-audio-copy'>
        <p className='system-b-thread-audio-title'>{title}</p>
        <p className='system-b-thread-audio-meta'>
          {artist} · {duration}
        </p>
      </div>
      <button
        type='button'
        onClick={onPlay}
        disabled={!onPlay}
        className='system-b-thread-audio-play'
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
