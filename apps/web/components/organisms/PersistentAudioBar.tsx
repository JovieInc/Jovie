'use client';

import { Button } from '@jovie/ui';
import { AudioLines, Pause, Play, X } from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SeekBar } from '@/components/atoms/SeekBar';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { toast } from '@/components/feedback';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { AudioBar, type AudioBarTrack } from '@/components/shell/AudioBar';
import { IconBtn } from '@/components/shell/IconBtn';
import { SidebarNowPlaying } from '@/components/shell/SidebarNowPlaying';
import {
  APP_ROUTES,
  buildLyricsRoute,
  resolveLyricsReturnRoute,
} from '@/constants/routes';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';
import { isFormElement } from '@/lib/utils/keyboard';
import {
  resetAudioChromeSnapshot,
  setAudioChromeSnapshot,
} from './audio-chrome-state';

const SHELL_AUDIO_BAR_TRANSITION =
  'max-height var(--ds-motion-cinematic-duration) var(--ds-motion-cinematic-easing), opacity var(--ds-motion-cinematic-duration) var(--ds-motion-cinematic-easing), transform var(--ds-motion-cinematic-duration) var(--ds-motion-cinematic-easing)';
const SHELL_AUDIO_CHROME_TRANSITION_CLASSNAME =
  'transition-[max-height,opacity,transform,border-color,background-color] duration-cinematic ease-cinematic';
/** Docked now-playing chip — flat, no elevation into the content canvas (JOV-3511). */
const SHELL_NOW_PLAYING_CARD_CLASSNAME =
  'max-w-56 rounded-md border-0 bg-transparent px-1 py-1 shadow-none transition-[opacity] duration-cinematic ease-cinematic';

function isLyricsRoutePath(pathname: string | null): boolean {
  return (
    pathname === APP_ROUTES.LYRICS ||
    Boolean(pathname?.startsWith(`${APP_ROUTES.LYRICS}/`))
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
  const prefersReducedMotion = useReducedMotion();
  const [imgError, setImgError] = useState(false);
  const [barCollapsed, setBarCollapsed] = useState(false);
  // The player shell is a global affordance even before a track is selected.
  // Keep its idle slot mounted at zero height; the tray itself only opens on an
  // explicit player shortcut so route content never gains surprise chrome.
  const [idleTrayOpen, setIdleTrayOpen] = useState(false);
  const [waveformOn, setWaveformOn] = useState(true);
  // Cinematic reveal (JOV-3487): the shell bar lands into place from the
  // bottom on first play. Starts un-revealed so the CSS transition has an
  // off-screen "from" frame to interpolate from; flips to revealed on the
  // next frame after a track becomes active. Resets per track so a fresh
  // track replays the reveal even without an unmount.
  const [revealed, setRevealed] = useState(false);
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
    setBarCollapsed(false);
  }, [playbackState.activeTrackId]);

  // Drive the cinematic reveal. No active track → no reveal (un-revealed so
  // the next first-play animates in). Reduced motion → snap revealed (no
  // translate frame ever paints). Otherwise paint one un-revealed frame, then
  // flip to revealed on the next animation frame so the bar decelerates into
  // place from below.
  useEffect(() => {
    if (!playbackState.activeTrackId) {
      setRevealed(false);
      return;
    }
    if (prefersReducedMotion) {
      setRevealed(true);
      return;
    }
    setRevealed(false);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setRevealed(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [playbackState.activeTrackId, prefersReducedMotion]);

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

  const handleCloseLyrics = useCallback(() => {
    router.push(
      resolveLyricsReturnRoute(
        searchParams.get('from'),
        lastNonLyricsPathRef.current
      )
    );
  }, [router, searchParams]);

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
  const compactPlayerVisible = Boolean(activeTrackId) && barCollapsed;

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

      if (event.key === 'Escape' && !hasActiveTrack && idleTrayOpen) {
        event.preventDefault();
        setIdleTrayOpen(false);
        return;
      }

      if (event.key === '`' && plainKey) {
        event.preventDefault();
        if (hasActiveTrack) {
          setBarCollapsed(value => !value);
        } else {
          setIdleTrayOpen(value => !value);
        }
        return;
      }

      if (
        event.key === '\\' &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        if (hasActiveTrack) {
          setBarCollapsed(value => !value);
        } else {
          setIdleTrayOpen(value => !value);
        }
        return;
      }

      if (!hasActiveTrack) return;

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
        return;
      }
    }

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [
    handleCloseLyrics,
    handleOpenLyrics,
    handleToggle,
    hasActiveTrack,
    idleTrayOpen,
    pathname,
    playbackState.hasLyrics,
  ]);

  useEffect(() => {
    if (!activeTrackId) {
      resetAudioChromeSnapshot();
      return;
    }

    setAudioChromeSnapshot({
      activeTrackId,
      compactPlayerVisible,
      fullPlayerVisible: !compactPlayerVisible,
    });
  }, [activeTrackId, compactPlayerVisible]);

  useEffect(() => {
    return resetAudioChromeSnapshot;
  }, []);

  if (!activeTrackId) {
    const isLibraryRoute = pathname === APP_ROUTES.LIBRARY;
    const idleTray = (testId: string, className?: string) => (
      <section
        aria-hidden={!idleTrayOpen}
        aria-label='Playback Controls'
        inert={idleTrayOpen ? undefined : true}
        className={cn(
          'shrink-0 overflow-hidden bg-(--app-shell-content-surface)',
          idleTrayOpen
            ? 'border-t border-(--app-shell-border)'
            : 'border-t border-transparent',
          SHELL_AUDIO_CHROME_TRANSITION_CLASSNAME,
          className
        )}
        data-testid={testId}
        data-mobile-audio-surface={
          testId === 'audio-surface-idle-shell-mobile' ? 'true' : undefined
        }
        style={{
          maxHeight: idleTrayOpen ? 'var(--app-shell-audio-bar-max-height)' : 0,
          opacity: idleTrayOpen ? 1 : 0,
          transform: prefersReducedMotion
            ? 'translateY(0)'
            : idleTrayOpen
              ? 'translateY(0)'
              : 'translateY(10px)',
          pointerEvents: idleTrayOpen ? 'auto' : 'none',
          transition: prefersReducedMotion
            ? 'none'
            : SHELL_AUDIO_BAR_TRANSITION,
        }}
      >
        <div
          className='flex items-center justify-between gap-4 px-4 py-3 lg:px-6'
          style={{ minHeight: 'var(--app-shell-audio-bar-max-height)' }}
        >
          <div className='flex min-w-0 items-center gap-3'>
            <AudioLines
              aria-hidden='true'
              className='h-4 w-4 shrink-0 text-quaternary-token opacity-50'
              strokeWidth={1.5}
            />
            <div className='min-w-0'>
              <p className='text-sm font-medium text-secondary-token'>
                Nothing playing
              </p>
              <p className='text-pretty text-xs leading-4 text-tertiary-token'>
                {isLibraryRoute
                  ? 'Choose a track to start playback.'
                  : 'Choose a track from Library to start playback.'}
              </p>
            </div>
          </div>
          <div className='flex shrink-0 items-center gap-1'>
            {!isLibraryRoute ? (
              <Button
                size='sm'
                variant='link'
                onClick={() => router.push(APP_ROUTES.LIBRARY)}
              >
                Open Library
              </Button>
            ) : null}
            <IconBtn
              label='Close Playback Controls'
              tooltipSide='top'
              tone='ghost'
              onClick={() => setIdleTrayOpen(false)}
            >
              <X aria-hidden='true' className='h-3.5 w-3.5' />
            </IconBtn>
          </div>
        </div>
      </section>
    );

    return (
      <>
        {idleTray('audio-surface-idle-shell-desktop', 'hidden lg:block')}
        {idleTray('audio-surface-idle-shell-mobile', 'lg:hidden')}
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
  let playButtonIcon = <Play className='h-3 w-3' />;
  if (isLoading) {
    playButtonLabel = 'Loading track';
    playButtonIcon = (
      <div className='h-3 w-3 animate-pulse rounded-full bg-current' />
    );
  } else if (playbackState.isPlaying) {
    playButtonLabel = 'Pause playback';
    playButtonIcon = <Pause className='h-3 w-3' />;
  }

  const mobileBar = (className?: string) => (
    <section
      aria-label='Audio Player'
      aria-hidden='false'
      data-mobile-audio-surface='true'
      className={cn(
        'animate-in fade-in slide-in-from-bottom-2 duration-cinematic shrink-0 border-t border-subtle bg-(--app-shell-content-surface) backdrop-blur-xl px-3 py-2',
        className
      )}
    >
      <div className='flex items-center gap-3'>
        {/* Artwork */}
        {playbackState.artworkUrl && !imgError ? (
          <Image
            src={playbackState.artworkUrl}
            alt=''
            width={36}
            height={36}
            className='h-9 w-9 shrink-0 rounded-lg object-cover'
            unoptimized
            onError={() => setImgError(true)}
          />
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
        <button
          type='button'
          onClick={handleToggle}
          disabled={isLoading}
          className='relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token transition-[background-color,color,border-color] duration-subtle hover:border-default hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 before:absolute before:-inset-2 before:content-[""]'
          aria-label={playButtonLabel}
        >
          {playButtonIcon}
        </button>

        {/* Dismiss button — 24px visible, 44px touch target via before pseudo-element */}
        <button
          type='button'
          onClick={stop}
          className='relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-quaternary-token transition-colors duration-subtle hover:text-secondary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring before:absolute before:-inset-2.5 before:content-[""]'
          aria-label='Dismiss Player'
        >
          <X className='h-3.5 w-3.5' />
        </button>
      </div>
    </section>
  );

  const shellTrack: AudioBarTrack = {
    id: activeTrackId,
    title: playbackState.trackTitle ?? '',
    artist: playbackState.artistName ?? '',
    hasLyrics: playbackState.hasLyrics,
  };
  const lyricsPath = buildLyricsRoute(activeTrackId);
  const nowPlayingTrack = {
    trackTitle: playbackState.trackTitle,
    artistName: playbackState.artistName,
    artworkUrl: playbackState.artworkUrl,
  };

  return (
    <>
      {/* Full docked player — sits below main content inside the shell frame.
          When minimized, height collapses to 0 and the sidebar mini takes over
          (JOV-3511: never full + mini at once; no elevated float into canvas). */}
      <div
        data-testid='audio-surface-expanded-shell'
        data-shell-audio-surface='persistent-expanded'
        aria-hidden={barCollapsed}
        className={cn(
          'hidden shrink-0 overflow-hidden border-t border-(--app-shell-border) bg-(--app-shell-content-surface) lg:block',
          SHELL_AUDIO_CHROME_TRANSITION_CLASSNAME
        )}
        style={{
          maxHeight: barCollapsed ? 0 : 'var(--app-shell-audio-bar-max-height)',
          opacity: revealed && !barCollapsed ? 1 : 0,
          transform: !revealed
            ? 'translateY(100%)'
            : barCollapsed
              ? 'translateY(10px)'
              : 'translateY(0)',
          // Keyed on collapse only — the reveal is purely visual (transform +
          // opacity), so the bar stays interactive the instant it mounts
          // rather than waiting out the slide-in.
          pointerEvents: barCollapsed ? 'none' : 'auto',
          transition: SHELL_AUDIO_BAR_TRANSITION,
        }}
      >
        <div className='grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] items-center gap-3 px-4 py-1.5 lg:px-6'>
          <SidebarNowPlaying
            track={nowPlayingTrack}
            isPlaying={playbackState.isPlaying}
            onPlay={handleToggle}
            playOverlayVisible={false}
            className={SHELL_NOW_PLAYING_CARD_CLASSNAME}
          />
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
            onCollapse={() => setBarCollapsed(true)}
            onDismiss={stop}
            currentTime={playbackState.currentTime}
            duration={playbackState.duration}
            onSeek={seek}
            waveformOn={waveformOn}
            onToggleWaveform={() => setWaveformOn(current => !current)}
            lyricsActive={pathname === lyricsPath}
            onOpenLyrics={
              playbackState.hasLyrics ? handleOpenLyrics : undefined
            }
            track={shellTrack}
            className='min-w-0 px-0 py-0'
          />
        </div>
      </div>
      {/* Compact surface is intentionally empty: mini chrome lives in the
          sidebar bridge when the full bar is minimized (JOV-3511). Kept as a
          zero-height slot so tests and chrome-state consumers still see the
          minimize transition without a second visible player. */}
      <div
        data-testid='audio-surface-compact-shell'
        data-shell-audio-surface='persistent-compact'
        aria-hidden={!barCollapsed}
        className={cn(
          'hidden shrink-0 overflow-hidden lg:block',
          SHELL_AUDIO_CHROME_TRANSITION_CLASSNAME
        )}
        style={{
          maxHeight: 0,
          opacity: 0,
          pointerEvents: 'none',
          transition: SHELL_AUDIO_BAR_TRANSITION,
        }}
      />
      {mobileBar('lg:hidden')}
    </>
  );
}
