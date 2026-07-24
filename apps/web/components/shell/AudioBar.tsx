'use client';

import {
  AudioLines,
  AudioWaveform,
  Mic2,
  Minimize2,
  Pause,
  Play,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { SHORTCUTS } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
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
  /** When true, surfaces the Lyrics toggle. */
  readonly hasLyrics?: boolean;
}

/**
 * AudioBar — bottom-of-screen audio player chrome.
 *
 * Two-row Spotify-style layout: waveform drawer (collapsible) above, transport
 * controls below. Right cluster offers Lyrics (when available), Waveform
 * toggle, and Minimize. Filled-waveform variant only — alternate variants
 * (hairlines / stereo / RMS / dense bars) lived in the dev picker and were
 * not extracted.
 *
 * Pure presentational component — all state is owned by the caller. Wire
 * `useTrackAudioPlayer()` (or equivalent) into the props at the mount site.
 *
 * @example
 * ```tsx
 * const player = useTrackAudioPlayer();
 * const [waveformOn, setWaveformOn] = useState(false);
 * const [loopMode, setLoopMode] = useState<LoopMode>('off');
 *
 * <AudioBar
 *   isPlaying={player.playbackState.isPlaying}
 *   onPlay={() => player.toggleTrack(currentTrack)}
 *   onCollapse={() => setBarCollapsed(true)}
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
  onCollapse,
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
  track,
  className,
}: {
  readonly isPlaying: boolean;
  readonly onPlay: () => void;
  readonly onSeek?: (time: number) => void;
  readonly onShuffle?: () => void;
  readonly onPrevious?: () => void;
  readonly onNext?: () => void;
  readonly onCollapse?: () => void;
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
        <button
          type='button'
          onClick={onPlay}
          className='h-8 w-8 rounded-full grid place-items-center border border-(--linear-btn-primary-border) bg-btn-primary text-btn-primary-foreground shadow-button-inset transition-colors duration-subtle ease-subtle hover:border-(--linear-btn-primary-hover) hover:bg-btn-primary-hover'
          aria-label={isPlaying ? 'Pause (space)' : 'Play (space)'}
        >
          {isPlaying ? (
            <Pause
              className='h-3.5 w-3.5'
              strokeWidth={2.5}
              fill='currentColor'
            />
          ) : (
            <Play
              className='h-3.5 w-3.5 translate-x-px'
              strokeWidth={2.5}
              fill='currentColor'
            />
          )}
        </button>
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

  const rightCluster = (
    <div className='flex items-center gap-1 justify-self-end'>
      {track.hasLyrics && onOpenLyrics && (
        <IconBtn
          label={lyricsActive ? 'Close lyrics' : 'Lyrics'}
          shortcut={SHORTCUTS.toggleLyrics}
          onClick={onOpenLyrics}
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
      {onCollapse && (
        <IconBtn
          label='Minimize Player'
          shortcut={SHORTCUTS.toggleBar}
          onClick={onCollapse}
          tooltipSide='top'
          tone='ghost'
          testId='audio-bar-minimize'
        >
          <Minimize2 className='h-3.5 w-3.5' strokeWidth={2.25} />
        </IconBtn>
      )}
    </div>
  );

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
            maxHeight: waveformOn ? 40 : 0,
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
        </div>
        {transportButtons}
      </div>
      {rightCluster}
    </section>
  );
}
