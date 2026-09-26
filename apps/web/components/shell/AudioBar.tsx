// @coverage-via apps/web/components/shell/__tests__/AudioBar.test.tsx
'use client';

import {
  AudioLines,
  AudioWaveform,
  Mic2,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { SHORTCUTS } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { AudioPlayButton } from './AudioPlayControl';
import { IconBtn } from './IconBtn';
import { LoopBtn, type LoopMode } from './LoopBtn';
import {
  type ScrubCue,
  ScrubGradient,
  type ScrubLoopSection,
} from './ScrubGradient';
import { Tooltip } from './Tooltip';

export interface AudioBarTrack {
  /** Used for accessible labels and ISRC-style follow-ups elsewhere. */
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  /** When true, surfaces the Karaoke (lyrics) toggle. */
  readonly hasLyrics?: boolean;
  /** Analyzed tempo, when known. Never fabricated — omit rather than guess. */
  readonly bpm?: number | null;
  /** Musical/Camelot key, when known. Never fabricated — omit rather than guess. */
  readonly musicalKey?: string | null;
}

/**
 * AudioBar — flat, in-flow audio player chrome (no card fill/border/shadow).
 *
 * Compact by default: artwork/title live in the caller's left column, this
 * component renders transport (prev / play-pause / next) plus exactly two
 * mode buttons — Karaoke (mic → lyrics) and Waveform. The waveform drawer
 * (seek scrub + elapsed/duration + "BPM · key" facts, when known) only
 * renders while `waveformOn` is true — never in compact. Filled-waveform
 * variant only — alternate variants (hairlines / stereo / RMS / dense bars)
 * lived in the dev picker and were not extracted.
 *
 * Pure presentational component — all state is owned by the caller. Wire
 * `useTrackAudioPlayer()` (or equivalent) into the props at the mount site.
 *
 * @example
 * ```tsx
 * const player = useTrackAudioPlayer();
 * const [waveformOn, setWaveformOn] = useState(false); // compact is default
 * const [loopMode, setLoopMode] = useState<LoopMode>('off');
 *
 * <AudioBar
 *   isPlaying={player.playbackState.isPlaying}
 *   onPlay={() => player.toggleTrack(currentTrack)}
 *   currentTime={player.playbackState.currentTime}
 *   duration={player.playbackState.duration}
 *   loopMode={loopMode}
 *   onCycleLoop={() => setLoopMode(m =>
 *     m === 'off' ? 'track' : m === 'track' ? 'section' : 'off'
 *   )}
 *   waveformOn={waveformOn}
 *   onToggleWaveform={() => setWaveformOn(v => !v)}
 *   track={{ id: 'bahamas-lost-light', title: 'Lost in the Light', artist: 'Bahamas', hasLyrics: true }}
 *   onOpenLyrics={() => router.push(`/app/lyrics/${activeTrackId}`)}
 *   lyricsActive={pathname.startsWith('/app/lyrics/')}
 * />
 * ```
 */
export function AudioBar({
  isPlaying,
  onPlay,
  onSeek,
  onShuffle,
  onPrevious,
  onNext,
  currentTime,
  duration,
  cues,
  loopMode,
  onCycleLoop,
  loopSection,
  waveformOn,
  onToggleWaveform,
  lyricsActive,
  onOpenLyrics,
  onPrefetchLyrics,
  track,
  className,
}: {
  readonly isPlaying: boolean;
  readonly onPlay: () => void;
  readonly onSeek?: (time: number) => void;
  readonly onShuffle?: () => void;
  readonly onPrevious?: () => void;
  readonly onNext?: () => void;
  readonly currentTime: number;
  readonly duration: number;
  readonly cues?: readonly ScrubCue[];
  readonly loopMode?: LoopMode;
  readonly onCycleLoop?: () => void;
  readonly loopSection?: ScrubLoopSection;
  readonly waveformOn?: boolean;
  readonly onToggleWaveform?: () => void;
  readonly lyricsActive?: boolean;
  readonly onOpenLyrics?: () => void;
  /** Intent hook — fires on hover/focus of the lyrics toggle so the caller can
   * warm the lyrics route before click (JOV-6544). */
  readonly onPrefetchLyrics?: () => void;
  readonly track: AudioBarTrack;
  readonly className?: string;
}) {
  const transportButtons = (
    <div className='flex items-center gap-1.5 justify-self-center'>
      {onShuffle && (
        <IconBtn
          label='Shuffle'
          tooltipSide='top'
          tone='ghost'
          onClick={onShuffle}
        >
          <Shuffle className='h-3.5 w-3.5' strokeWidth={2.25} />
        </IconBtn>
      )}
      {onPrevious && (
        <IconBtn
          label='Previous'
          tooltipSide='top'
          tone='ghost'
          onClick={onPrevious}
        >
          <SkipBack className='h-4 w-4' strokeWidth={2.5} fill='currentColor' />
        </IconBtn>
      )}
      <Tooltip
        label={isPlaying ? 'Pause' : 'Play'}
        shortcut={SHORTCUTS.playPause}
        side='top'
      >
        <AudioPlayButton
          isPlaying={isPlaying}
          onClick={onPlay}
          label={isPlaying ? 'Pause (space)' : 'Play (space)'}
          size='bar'
        />
      </Tooltip>
      {onNext && (
        <IconBtn label='Next' tooltipSide='top' tone='ghost' onClick={onNext}>
          <SkipForward
            className='h-4 w-4'
            strokeWidth={2.5}
            fill='currentColor'
          />
        </IconBtn>
      )}
      {loopMode && onCycleLoop && (
        <LoopBtn mode={loopMode} onClick={onCycleLoop} />
      )}
    </div>
  );

  // Karaoke (mic → lyrics) and Waveform are the only two mode buttons in the
  // compact bar. Lyrics conditionally hides when the track has none — that
  // still leaves at most these two, never a third.
  const rightCluster = (
    <div
      data-testid='audio-bar-mode-buttons'
      className='flex items-center gap-1 justify-self-end'
    >
      {track.hasLyrics && onOpenLyrics && (
        <IconBtn
          label={lyricsActive ? 'Close lyrics' : 'Lyrics'}
          shortcut={SHORTCUTS.toggleLyrics}
          onClick={onOpenLyrics}
          onMouseEnter={onPrefetchLyrics}
          onFocus={onPrefetchLyrics}
          active={lyricsActive}
          tooltipSide='top'
          tone='ghost'
        >
          <Mic2 className='h-3.5 w-3.5' strokeWidth={2.25} />
        </IconBtn>
      )}
      {typeof waveformOn === 'boolean' && onToggleWaveform && (
        <IconBtn
          label={waveformOn ? 'Hide waveform' : 'Show waveform'}
          shortcut={SHORTCUTS.toggleWaveform}
          onClick={onToggleWaveform}
          active={waveformOn}
          tooltipSide='top'
          tone='ghost'
        >
          {waveformOn ? (
            <AudioLines className='h-3.5 w-3.5' strokeWidth={2.25} />
          ) : (
            <AudioWaveform className='h-3.5 w-3.5' strokeWidth={2.25} />
          )}
        </IconBtn>
      )}
    </div>
  );

  // "BPM · key" facts — only ever built from real analyzed data. Absent
  // fields are omitted rather than guessed, and the whole row disappears
  // when nothing is known.
  const trackFacts = [
    typeof track.bpm === 'number' && Number.isFinite(track.bpm)
      ? `${Math.round(track.bpm)} BPM`
      : null,
    track.musicalKey || null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
  const drawerHeight = trackFacts ? 56 : 40;

  return (
    <section
      aria-label='Audio Player'
      className={cn(
        // Visibility is owned by shell parents (e.g. PersistentAudioBar surfaces).
        // Avoid nested `hidden lg:*` here — when Tailwind is active in CI/jsdom,
        // it leaves sibling now-playing chrome visible while hiding transport controls.
        // Single-row dock: parent may own the left now-playing column (JOV-3511).
        'group/bar shrink-0 grid grid-cols-[minmax(240px,_1fr)_auto] gap-3 items-center px-2 py-1.5',
        className
      )}
    >
      {/* Center column: waveform drawer above (collapsible), transport below. */}
      <div className='flex flex-col items-center justify-center min-h-11 min-w-0'>
        <div
          aria-hidden={!waveformOn}
          className='w-full overflow-hidden'
          style={{
            maxHeight: waveformOn ? drawerHeight : 0,
            opacity: waveformOn ? 1 : 0,
            transform: waveformOn ? 'translateY(0)' : 'translateY(6px)',
            transition: `max-height var(--ds-motion-cinematic-duration) var(--ds-motion-cinematic-easing), opacity var(--ds-motion-cinematic-duration) var(--ds-motion-cinematic-easing), transform var(--ds-motion-cinematic-duration) var(--ds-motion-cinematic-easing)`,
          }}
        >
          <div className='pt-1.5 pb-1.5'>
            <ScrubGradient
              currentTime={currentTime}
              duration={duration}
              onSeek={onSeek}
              cues={cues}
              loopMode={loopMode}
              loopSection={loopSection}
            />
          </div>
          {waveformOn && trackFacts ? (
            <div className='pb-1 text-center text-3xs tabular-nums text-quaternary-token'>
              {trackFacts}
            </div>
          ) : null}
        </div>
        {transportButtons}
      </div>
      {rightCluster}
    </section>
  );
}
