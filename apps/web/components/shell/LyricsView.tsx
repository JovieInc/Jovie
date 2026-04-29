'use client';

import { Mic2, Sparkles } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { LyricRow } from './LyricRow';
import { LyricsHeader } from './LyricsHeader';
import { LyricsTimeline } from './LyricsTimeline';
import type { LyricLine, LyricsViewTrack } from './LyricsView.types';

export type { LyricLine, LyricsViewTrack } from './LyricsView.types';

/**
 * LyricsView — full-screen lyrics with timed playhead, J/K nav, edit mode.
 *
 * Active line = last line whose `startSec ≤ currentTimeSec`. Active is full
 * brightness; siblings dim. J/K (or arrow up/down) moves focus; Enter stamps
 * the focused line to the current playhead. Click any line to seek.
 *
 * Empty state offers Transcribe + Paste lyrics affordances; consumers wire
 * `onTranscribe` / `onPaste` to the production handlers.
 *
 * Pure presentational — `lines` and `currentTimeSec` are controlled props.
 *
 * @example
 * ```tsx
 * const { playbackState, seek } = useTrackAudioPlayer();
 * const [lines, setLines] = useState<LyricLine[]>(initialLines);
 * <LyricsView
 *   track={{ artist: 'Bahamas', title: 'Lost in the Light' }}
 *   durationSec={playbackState.duration}
 *   currentTimeSec={playbackState.currentTime}
 *   lines={lines}
 *   onLinesChange={setLines}
 *   onSeek={seek}
 * />
 * ```
 */
export function LyricsView({
  track,
  durationSec,
  currentTimeSec,
  lines,
  onLinesChange,
  onSeek,
  onArtistClick,
  onTranscribe,
  onPaste,
  editing = false,
  timed = true,
  className,
}: {
  readonly track: LyricsViewTrack;
  readonly durationSec: number;
  readonly currentTimeSec: number;
  readonly lines: readonly LyricLine[];
  readonly onLinesChange?: (next: LyricLine[]) => void;
  readonly onSeek: (sec: number) => void;
  readonly onArtistClick?: () => void;
  readonly onTranscribe?: () => void;
  readonly onPaste?: () => void;
  readonly editing?: boolean;
  readonly timed?: boolean;
  readonly className?: string;
}) {
  const [focusedIndex, setFocusedIndex] = useState(0);

  const activeIndex = useMemo(() => {
    // Scan every line — caller may have edited a stamp out of order
    // (LyricsView allows mid-list reordering via stampLine), so we cannot
    // rely on ascending order to early-exit. Linear scan is O(n) but n is
    // typically <40 lyric lines per track.
    if (!timed) return -1;

    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startSec <= currentTimeSec) idx = i;
    }
    return idx;
  }, [lines, currentTimeSec, timed]);

  useEffect(() => {
    if (activeIndex >= 0) setFocusedIndex(activeIndex);
  }, [activeIndex]);

  function stampLine(index: number) {
    if (!onLinesChange) return;
    onLinesChange(
      lines.map((l, i) =>
        i === index ? { ...l, startSec: currentTimeSec } : l
      )
    );
  }

  function updateLineText(index: number, text: string) {
    if (!onLinesChange) return;
    onLinesChange(lines.map((l, i) => (i === index ? { ...l, text } : l)));
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(i => Math.min(lines.length - 1, i + 1));
    } else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && editing) {
      e.preventDefault();
      stampLine(focusedIndex);
    }
  }

  if (lines.length === 0) {
    return (
      <section
        aria-label='Lyrics'
        className={cn('flex h-full flex-col focus:outline-none', className)}
      >
        <LyricsHeader track={track} onArtistClick={onArtistClick} />
        <div className='flex-1 min-h-0 grid place-items-center px-6'>
          <div className='max-w-md w-full px-6 py-8 text-center'>
            <div className='mx-auto h-10 w-10 grid place-items-center mb-4'>
              <Mic2
                className='h-4 w-4 text-quaternary-token'
                strokeWidth={2.25}
              />
            </div>
            <h2 className='text-[18px] font-display tracking-[-0.012em] text-primary-token'>
              No lyrics yet
            </h2>
            <p className='mt-2 text-[13px] leading-[1.55] text-tertiary-token'>
              Jovie will time them automatically and you can fine-tune timings
              line by line.
            </p>
            <div className='mt-5 flex items-center justify-center gap-2'>
              {onTranscribe && (
                <button
                  type='button'
                  onClick={onTranscribe}
                  className='inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-white text-black text-[12.5px] font-caption tracking-[-0.005em] hover:brightness-110 active:scale-[0.99] transition-all duration-150 ease-out'
                >
                  <Sparkles className='h-3.5 w-3.5' strokeWidth={2.25} />
                  Transcribe with Jovie
                </button>
              )}
              {onPaste && (
                <button
                  type='button'
                  onClick={onPaste}
                  className='inline-flex items-center h-8 px-4 rounded-full border border-(--linear-app-shell-border) bg-surface-1/60 text-[12.5px] font-caption text-secondary-token tracking-[-0.005em] transition-colors duration-150 ease-out hover:text-primary-token hover:bg-surface-1'
                >
                  Paste lyrics
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: keyboard list root for J/K + Enter, mirrors TracksView
    <section
      className={cn('flex h-full flex-col focus:outline-none', className)}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard entry point for J/K + Enter navigation
      tabIndex={0}
      onKeyDown={handleKey}
      aria-label='Lyrics'
    >
      <LyricsHeader track={track} onArtistClick={onArtistClick} />
      <div className='flex-1 min-h-0 overflow-y-auto'>
        <ul className='mx-auto max-w-2xl px-6 py-10 space-y-5'>
          {lines.map((line, i) => {
            const isActive = i === activeIndex;
            const isFocused = i === focusedIndex;
            return (
              <LyricRow
                // biome-ignore lint/suspicious/noArrayIndexKey: lyric lines are positional in the timeline; multiple lines may share a startSec mid-edit
                key={i}
                line={line}
                index={i}
                isActive={isActive}
                isFocused={isFocused}
                editing={editing && Boolean(onLinesChange)}
                interactive={timed}
                onFocus={() => setFocusedIndex(i)}
                onSeek={() => onSeek(line.startSec)}
                onStamp={() => stampLine(i)}
                onChangeText={text => updateLineText(i, text)}
              />
            );
          })}
        </ul>
      </div>
      {timed && (
        <LyricsTimeline
          durationSec={durationSec}
          currentTimeSec={currentTimeSec}
          lines={lines}
          activeIndex={activeIndex}
          onSeek={onSeek}
        />
      )}
    </section>
  );
}
