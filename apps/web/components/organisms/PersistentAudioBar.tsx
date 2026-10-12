'use client';

// @coverage-via apps/web/tests/components/organisms/PersistentAudioBar.test.tsx
import {
  ChevronDown,
  ChevronUp,
  Play,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ARTWORK_FIT_CLASSNAME,
  ArtworkFrame,
} from '@/components/atoms/ArtworkFrame';
import { SeekBar } from '@/components/atoms/SeekBar';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { toast } from '@/components/feedback';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { AudioBar, type AudioBarTrack } from '@/components/shell/AudioBar';
import { AudioPlayButton } from '@/components/shell/AudioPlayControl';
import { IconBtn } from '@/components/shell/IconBtn';
import { ShellAudioDock } from '@/components/shell/ShellAudioDock';
import {
  APP_ROUTES,
  buildLyricsRoute,
  resolveLyricsReturnRoute,
} from '@/constants/routes';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';
import { isFormElement } from '@/lib/utils/keyboard';
import {
  mediaCanvasTransport,
  resetAudioChromeSnapshot,
  setAudioChromeSnapshot,
  useFullAudioPlayerExpandRequests,
  useMediaCanvasTransport,
} from './audio-chrome-state';

function isLyricsRoutePath(pathname: string | null): boolean {
  return (
    pathname === APP_ROUTES.LYRICS ||
    Boolean(pathname?.startsWith(`${APP_ROUTES.LYRICS}/`))
  );
}

/**
 * PlayerVisibilityToggle — the sole affordance for opening/closing the
 * compact player once a track is active (founder spec 2026-09-25). Subtle
 * when closed, more prominent while open. 28px visible control, 44px hit
 * area via the invisible `before:` pseudo-element (canonical touch-target
 * pattern — see `.claude/rules/ui.md` "Inclusion and Component Ownership").
 */
function PlayerVisibilityToggle({
  open,
  onClick,
}: {
  readonly open: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-label={open ? 'Hide Player' : 'Show Player'}
      aria-expanded={open}
      data-testid='player-visibility-toggle'
      className={cn(
        'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-subtle ease-subtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'before:absolute before:left-1/2 before:top-1/2 before:h-full before:min-h-11 before:min-w-11 before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
        open
          ? 'border border-subtle bg-surface-1/40 text-primary-token'
          : 'text-quaternary-token hover:text-secondary-token'
      )}
    >
      {open ? (
        <ChevronDown className='h-3.5 w-3.5' strokeWidth={2.25} />
      ) : (
        <ChevronUp className='h-3.5 w-3.5' strokeWidth={2.25} />
      )}
    </button>
  );
}

export function PersistentAudioBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    playbackState,
    toggleTrack,
    playNext,
    playPrevious,
    seek,
    stop,
    onError,
  } = useTrackAudioPlayer();
  const [imgError, setImgError] = useState(false);
  // While the media canvas is open it owns playback (JOV-7240): the dock
  // renders the canvas transport — play/pause, scrub, time, next/previous
  // item — instead of the audio track, which the canvas pauses on play.
  const canvasTransport = useMediaCanvasTransport();
  // Compact is the default surface for an active track (founder spec
  // 2026-09-25). The dock's PlayerVisibilityToggle closes it to the sidebar
  // mini (JOV-3511); idle/dismissed playback leaves no dock at all (JOV-6680).
  const [playerOpen, setPlayerOpen] = useState(true);
  const [waveformOn, setWaveformOn] = useState(false);
  // Reopen requests from compact chrome (e.g. the sidebar mini card) land on
  // this counter; the player owns `playerOpen` so the published snapshot
  // always matches the rendered dock.
  const fullPlayerExpandRequests = useFullAudioPlayerExpandRequests();
  const lastNonLyricsPathRef = useRef<string>(APP_ROUTES.LIBRARY);
  const currentPathWithSearch = useMemo(() => {
    if (!pathname) return APP_ROUTES.LIBRARY;

    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    return onError(() => {
      toast.error('Preview unavailable', { id: 'audio-preview-error' });
    });
  }, [onError]);

  useEffect(() => {
    setImgError(false);
  }, [playbackState.artworkUrl]);

  useEffect(() => {
    setPlayerOpen(true);
  }, [playbackState.activeTrackId]);

  // The shell dock (ShellAudioDock) owns the cinematic reveal/hide motion —
  // it transitions height/opacity/transform off the published
  // `fullPlayerVisible` snapshot, so no per-track reveal bookkeeping lives
  // here. Compact chrome (sidebar mini) asks to reopen the full player via
  // the expand-request counter.
  const lastExpandRequestRef = useRef(fullPlayerExpandRequests);
  useEffect(() => {
    if (fullPlayerExpandRequests === lastExpandRequestRef.current) return;
    lastExpandRequestRef.current = fullPlayerExpandRequests;
    setPlayerOpen(true);
  }, [fullPlayerExpandRequests]);

  useEffect(() => {
    if (!isLyricsRoutePath(pathname) && pathname) {
      lastNonLyricsPathRef.current = currentPathWithSearch;
    }
  }, [currentPathWithSearch, pathname]);

  const handleToggle = useCallback(() => {
    if (playbackState.playbackStatus === 'loading') return;
    if (!playbackState.activeTrackId || !playbackState.trackTitle) return;
    toggleTrack({
      id: playbackState.activeTrackId,
      title: playbackState.trackTitle,
    }).catch(() => {});
  }, [
    playbackState.activeTrackId,
    playbackState.playbackStatus,
    playbackState.trackTitle,
    toggleTrack,
  ]);

  // Dismiss (X): hides the dock AND stops playback (JOV-6680) — pause keeps
  // the dock visible, so the only way to remove chrome is stopping the track.
  const handleDismiss = useCallback(() => {
    stop();
  }, [stop]);

  const handleCloseLyrics = useCallback(() => {
    router.push(
      resolveLyricsReturnRoute(
        searchParams.get('from'),
        lastNonLyricsPathRef.current
      )
    );
  }, [router, searchParams]);

  const prefetchLyricsRoute = useCallback(() => {
    if (!playbackState.activeTrackId || !playbackState.hasLyrics) return;
    router.prefetch(buildLyricsRoute(playbackState.activeTrackId));
  }, [playbackState.activeTrackId, playbackState.hasLyrics, router]);

  const handleOpenLyrics = useCallback(() => {
    if (!playbackState.activeTrackId) return;
    const lyricsBasePath = buildLyricsRoute(playbackState.activeTrackId);
    if (pathname === lyricsBasePath) {
      handleCloseLyrics();
      return;
    }
    router.push(
      buildLyricsRoute(playbackState.activeTrackId, {
        from: currentPathWithSearch,
      })
    );
  }, [
    currentPathWithSearch,
    handleCloseLyrics,
    pathname,
    playbackState.activeTrackId,
    router,
  ]);

  const activeTrackId = playbackState.activeTrackId;
  const hasActiveTrack = Boolean(activeTrackId);
  // Idle (nothing loaded): the player is absent entirely — zero reserved
  // space, no layout shift of main content (founder spec 2026-09-25 #5).
  const compactPlayerVisible = hasActiveTrack && !playerOpen;

  // An active track with lyrics is the intent signal for the lyrics
  // surface (lyrics button and the `l` shortcut both land there). Warm the
  // route once per track so opening lyrics feels immediate; skipped while
  // already on a lyrics route. Bounded to one prefetch per track id.
  const prefetchedLyricsTrackRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !activeTrackId ||
      !playbackState.hasLyrics ||
      isLyricsRoutePath(pathname) ||
      prefetchedLyricsTrackRef.current === activeTrackId
    ) {
      return;
    }
    prefetchedLyricsTrackRef.current = activeTrackId;
    router.prefetch(buildLyricsRoute(activeTrackId));
  }, [activeTrackId, pathname, playbackState.hasLyrics, router]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isFormElement(event.target)) return;

      const hasModifier = event.metaKey || event.ctrlKey || event.altKey;
      const plainKey = !hasModifier && !event.shiftKey;
      const key = event.key.toLowerCase();

      if (event.key === 'Escape' && isLyricsRoutePath(pathname)) {
        event.preventDefault();
        handleCloseLyrics();
        return;
      }

      if (!hasActiveTrack) return;

      if (event.key === '`' && plainKey) {
        event.preventDefault();
        setPlayerOpen(value => !value);
        return;
      }

      if (
        event.key === '\\' &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setPlayerOpen(value => !value);
        return;
      }

      if (event.key === ' ' && plainKey) {
        event.preventDefault();
        handleToggle();
        return;
      }

      if (key === 'w' && plainKey) {
        event.preventDefault();
        setWaveformOn(value => !value);
        return;
      }

      if (key === 'l' && plainKey && playbackState.hasLyrics) {
        event.preventDefault();
        handleOpenLyrics();
      }
    }

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [
    handleCloseLyrics,
    handleOpenLyrics,
    handleToggle,
    hasActiveTrack,
    pathname,
    playbackState.hasLyrics,
  ]);

  useEffect(() => {
    if (!hasActiveTrack && !canvasTransport) {
      resetAudioChromeSnapshot();
      return;
    }

    setAudioChromeSnapshot({
      activeTrackId,
      compactPlayerVisible: canvasTransport ? false : compactPlayerVisible,
      fullPlayerVisible: canvasTransport ? true : !compactPlayerVisible,
    });
  }, [activeTrackId, compactPlayerVisible, hasActiveTrack, canvasTransport]);

  useEffect(() => {
    return resetAudioChromeSnapshot;
  }, []);

  // Canvas transport row — shown in the dock whenever MediaCanvasViewer owns
  // playback, with or without an audio track loaded (JOV-7240). Same dock
  // surface and reveal; next/previous step through photo and video items.
  const canvasDockRow = canvasTransport ? (
    <section
      aria-label='Media Player'
      data-testid='media-canvas-dock'
      className='flex items-center gap-3 px-4 py-1.5 lg:px-6'
    >
      <div className='w-30 min-w-0 shrink-0 lg:w-45'>
        <TruncatedText
          lines={1}
          className='text-xs font-caption leading-[1.2] text-primary-token'
        >
          {canvasTransport.title}
        </TruncatedText>
        <TruncatedText
          lines={1}
          className='text-2xs leading-[1.3] text-tertiary-token'
        >
          {`${canvasTransport.index + 1} / ${canvasTransport.count}${canvasTransport.isVideo ? '' : ' · Photo'}`}
        </TruncatedText>
      </div>
      <div className='flex min-w-0 flex-1 items-center gap-2'>
        {canvasTransport.hasPrevious ? (
          <IconBtn
            label='Previous Item'
            tooltipSide='top'
            tone='ghost'
            onClick={() => mediaCanvasTransport.previous()}
          >
            <SkipBack
              className='h-4 w-4'
              strokeWidth={2.5}
              fill='currentColor'
            />
          </IconBtn>
        ) : null}
        {canvasTransport.isVideo ? (
          <AudioPlayButton
            isPlaying={canvasTransport.isPlaying}
            onClick={() => mediaCanvasTransport.toggle()}
            label={canvasTransport.isPlaying ? 'Pause video' : 'Play video'}
            size='persistent'
          />
        ) : null}
        {canvasTransport.hasNext ? (
          <IconBtn
            label='Next Item'
            tooltipSide='top'
            tone='ghost'
            onClick={() => mediaCanvasTransport.next()}
          >
            <SkipForward
              className='h-4 w-4'
              strokeWidth={2.5}
              fill='currentColor'
            />
          </IconBtn>
        ) : null}
        {canvasTransport.isVideo ? (
          <>
            <span className='w-8 shrink-0 text-right text-3xs tabular-nums text-quaternary-token'>
              {formatDuration(Math.round(canvasTransport.currentTime) * 1000)}
            </span>
            <SeekBar
              currentTime={canvasTransport.currentTime}
              duration={canvasTransport.duration}
              onSeek={time => mediaCanvasTransport.seek(time)}
              className='h-1 min-w-15 flex-1 bg-surface-1'
            />
            <span className='w-8 shrink-0 text-3xs tabular-nums text-quaternary-token'>
              {canvasTransport.duration > 0
                ? formatDuration(Math.round(canvasTransport.duration) * 1000)
                : null}
            </span>
          </>
        ) : null}
      </div>
    </section>
  ) : null;

  if (!hasActiveTrack || !activeTrackId) {
    // Idle/stopped: keep the dock mounted but empty so ShellAudioDock can
    // animate 0-height after the snapshot clears (the panel slides back down
    // instead of the player vanishing). Zero reserved space — the closed
    // dock's max-height is 0. A live media-canvas session fills the dock
    // instead (JOV-7240).
    return (
      <>
        <div className='hidden shrink-0 lg:block'>
          <ShellAudioDock>{canvasDockRow}</ShellAudioDock>
        </div>
        {canvasTransport ? (
          <div className='lg:hidden'>{canvasDockRow}</div>
        ) : null}
      </>
    );
  }

  const isLoading = playbackState.playbackStatus === 'loading';

  const currentTimeFormatted = formatDuration(
    Math.round(playbackState.currentTime) * 1000
  );
  const durationFormatted =
    playbackState.duration > 0
      ? formatDuration(Math.round(playbackState.duration) * 1000)
      : null;
  const isPreview = playbackState.duration > 0 && playbackState.duration < 45;

  let playButtonLabel = 'Resume playback';
  if (isLoading) {
    playButtonLabel = 'Loading track';
  } else if (playbackState.isPlaying) {
    playButtonLabel = 'Pause playback';
  }

  const mobileBar = (className?: string) => (
    <section
      aria-label='Audio Player'
      aria-hidden='false'
      data-mobile-audio-surface='true'
      className={cn(
        // Flat: no border/blur "card" chrome — shares the main content
        // panel's own surface tone instead (founder spec 2026-09-25 #1).
        'animate-in fade-in slide-in-from-bottom-2 duration-cinematic shrink-0 bg-(--app-shell-content-surface) px-3 py-2',
        className
      )}
    >
      <div className='flex items-center gap-3'>
        {/* Artwork */}
        {playbackState.artworkUrl && !imgError ? (
          <ArtworkFrame size={36} className='h-9 w-9 shrink-0 bg-surface-2'>
            <Image
              src={playbackState.artworkUrl}
              alt=''
              fill
              sizes='36px'
              className={ARTWORK_FIT_CLASSNAME}
              unoptimized
              onError={() => setImgError(true)}
            />
          </ArtworkFrame>
        ) : (
          <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-1'>
            <Play className='h-3.5 w-3.5 text-tertiary-token' />
          </div>
        )}

        {/* Track info */}
        <div className='min-w-0 shrink-0 w-30 lg:w-45'>
          <TruncatedText
            lines={1}
            className='text-xs font-caption leading-[1.2] text-primary-token'
          >
            {playbackState.trackTitle ?? ''}
          </TruncatedText>
          {(playbackState.releaseTitle || playbackState.artistName) && (
            <TruncatedText
              lines={1}
              className='text-2xs leading-[1.3] text-tertiary-token'
            >
              {[playbackState.artistName, playbackState.releaseTitle]
                .filter(Boolean)
                .join(' · ')}
            </TruncatedText>
          )}
        </div>

        {/* Seek area */}
        <div className='flex flex-1 items-center gap-2 min-w-0'>
          <span className='text-3xs tabular-nums text-quaternary-token shrink-0 w-8 text-right'>
            {currentTimeFormatted}
          </span>
          <SeekBar
            currentTime={playbackState.currentTime}
            duration={playbackState.duration}
            onSeek={seek}
            disabled={isLoading}
            className='h-1 flex-1 min-w-15 bg-surface-1'
          />
          <span className='text-3xs tabular-nums text-quaternary-token shrink-0 w-8'>
            {durationFormatted}
          </span>
          {isPreview ? (
            <span className='text-3xs text-tertiary-token shrink-0'>
              Preview
            </span>
          ) : null}
        </div>

        {/* Play/pause button — 28px visible, 44px touch target via before pseudo-element */}
        <AudioPlayButton
          isPlaying={playbackState.isPlaying}
          isLoading={isLoading}
          onClick={handleToggle}
          label={playButtonLabel}
          size='persistent'
        />
      </div>
    </section>
  );

  const shellTrack: AudioBarTrack = {
    id: activeTrackId,
    title: playbackState.trackTitle ?? '',
    artist: playbackState.artistName ?? '',
    hasLyrics: playbackState.hasLyrics,
    bpm: playbackState.bpm,
    musicalKey: playbackState.musicalKey,
  };
  const lyricsPath = buildLyricsRoute(activeTrackId);

  return (
    <>
      {/* Desktop player host — the shell dock below the rounded main panel
          (JOV-6680). The dock itself owns visibility: it reads
          `fullPlayerVisible` from audio-chrome-state and animates height so
          the panel's bottom edge slides in lockstep. Closing to the sidebar
          mini (chevron) or dismissing (X → stop) collapses the dock to 0;
          JOV-3511 keeps full + mini exclusive. */}
      <div className='hidden shrink-0 lg:block'>
        <ShellAudioDock>
          {canvasDockRow ?? (
            <div
              data-testid='audio-surface-expanded-shell'
              data-shell-audio-surface='persistent-expanded'
              aria-hidden={!playerOpen}
              className='flex items-center gap-3 px-4 py-1.5 lg:px-6'
            >
              <AudioBar
                isPlaying={playbackState.isPlaying}
                onPlay={handleToggle}
                onPrevious={
                  playbackState.hasPrevious
                    ? () => playPrevious().catch(() => {})
                    : undefined
                }
                onNext={
                  playbackState.hasNext
                    ? () => playNext().catch(() => {})
                    : undefined
                }
                currentTime={playbackState.currentTime}
                duration={playbackState.duration}
                onSeek={seek}
                waveformOn={waveformOn}
                onToggleWaveform={() => setWaveformOn(current => !current)}
                lyricsActive={pathname === lyricsPath}
                onOpenLyrics={
                  playbackState.hasLyrics ? handleOpenLyrics : undefined
                }
                onLyricsIntent={prefetchLyricsRoute}
                track={shellTrack}
                className='min-w-0 flex-1 px-0 py-0'
              />
              <div className='flex shrink-0 items-center gap-1'>
                <PlayerVisibilityToggle
                  open={playerOpen}
                  onClick={() => setPlayerOpen(value => !value)}
                />
                <IconBtn
                  label='Dismiss Player'
                  onClick={handleDismiss}
                  tooltipSide='top'
                  tone='ghost'
                  testId='audio-player-dismiss'
                >
                  <X
                    aria-hidden='true'
                    className='h-3.5 w-3.5'
                    strokeWidth={2.25}
                  />
                </IconBtn>
              </div>
            </div>
          )}
        </ShellAudioDock>
      </div>
      {canvasTransport ? (
        <div className='lg:hidden'>{canvasDockRow}</div>
      ) : (
        mobileBar('lg:hidden')
      )}
    </>
  );
}
