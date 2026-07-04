'use client';

import { Pause, Play, X } from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SeekBar } from '@/components/atoms/SeekBar';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { toast } from '@/components/feedback';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { AudioBar, type AudioBarTrack } from '@/components/shell/AudioBar';
import { SidebarBottomNowPlaying } from '@/components/shell/SidebarBottomNowPlaying';
import { SidebarNowPlaying } from '@/components/shell/SidebarNowPlaying';
import {
  APP_ROUTES,
  buildLyricsRoute,
  resolveLyricsReturnRoute,
} from '@/constants/routes';
import { useAppFlag } from '@/lib/flags/client';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';
import { isFormElement } from '@/lib/utils/keyboard';
import {
  resetAudioChromeSnapshot,
  setAudioChromeSnapshot,
} from './audio-chrome-state';

export type PersistentAudioBarVariant = 'legacy' | 'shellChatV1';

interface PersistentAudioBarProps {
  readonly variant?: PersistentAudioBarVariant;
}

const SHELL_AUDIO_BAR_TRANSITION =
  'max-height var(--ds-motion-cinematic-duration) var(--ds-motion-cinematic-easing), opacity var(--ds-motion-cinematic-duration) var(--ds-motion-cinematic-easing), transform var(--ds-motion-cinematic-duration) var(--ds-motion-cinematic-easing)';
const SHELL_AUDIO_CHROME_TRANSITION_CLASSNAME =
  'transition-[max-height,opacity,transform,border-color,background-color] duration-cinematic ease-cinematic';
const SHELL_NOW_PLAYING_CARD_CLASSNAME =
  'max-w-56 rounded-lg border border-(--linear-app-shell-border)/75 bg-(--linear-app-content-surface) px-2 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.12)] transition-[opacity,transform] duration-cinematic ease-cinematic';
const SHELL_NOW_PLAYING_ROW_CLASSNAME =
  'max-w-64 border border-(--linear-app-shell-border)/75 bg-(--linear-app-content-surface) shadow-[0_10px_24px_rgba(0,0,0,0.12)] transition-[opacity,transform,border-color,background-color] duration-cinematic ease-cinematic';

function isLyricsRoutePath(pathname: string | null): boolean {
  return (
    pathname === APP_ROUTES.LYRICS ||
    Boolean(pathname?.startsWith(`${APP_ROUTES.LYRICS}/`))
  );
}

export function PersistentAudioBar({
  variant = 'legacy',
}: Readonly<PersistentAudioBarProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const designV1LyricsEnabled = useAppFlag('DESIGN_V1');
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
  const isShellAudioBar = variant === 'shellChatV1';
  const compactPlayerVisible =
    isShellAudioBar && Boolean(activeTrackId) && barCollapsed;

  useEffect(() => {
    if (variant !== 'shellChatV1' || !activeTrackId) return;

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

      if (
        key === 'l' &&
        plainKey &&
        designV1LyricsEnabled &&
        playbackState.hasLyrics
      ) {
        event.preventDefault();
        handleOpenLyrics();
        return;
      }

      if (event.key === '`' && plainKey) {
        event.preventDefault();
        setBarCollapsed(value => !value);
        return;
      }

      if (
        event.key === '\\' &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setBarCollapsed(value => !value);
      }
    }

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTrackId,
    designV1LyricsEnabled,
    handleCloseLyrics,
    handleOpenLyrics,
    handleToggle,
    pathname,
    playbackState.hasLyrics,
    variant,
  ]);

  useEffect(() => {
    if (!isShellAudioBar || !activeTrackId) {
      resetAudioChromeSnapshot();
      return;
    }

    setAudioChromeSnapshot({
      activeTrackId,
      compactPlayerVisible,
      fullPlayerVisible: !compactPlayerVisible,
    });
  }, [activeTrackId, compactPlayerVisible, isShellAudioBar]);

  useEffect(() => {
    return resetAudioChromeSnapshot;
  }, []);

  if (!activeTrackId) return null;

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

  const legacyBar = (className?: string) => (
    <section
      aria-label='Audio Player'
      className={cn(
        'animate-in fade-in slide-in-from-bottom-2 duration-cinematic shrink-0 border-t border-subtle bg-(--linear-app-content-surface) backdrop-blur-xl px-3 py-2 max-lg:mb-[calc(3.5rem+env(safe-area-inset-bottom))]',
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
          className='relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token transition-[background-color,color,border-color] duration-subtle hover:border-default hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus) disabled:opacity-50 before:absolute before:-inset-2 before:content-[""]'
          aria-label={playButtonLabel}
        >
          {playButtonIcon}
        </button>

        {/* Dismiss button — 24px visible, 44px touch target via before pseudo-element */}
        <button
          type='button'
          onClick={stop}
          className='relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-quaternary-token transition-colors duration-subtle hover:text-secondary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus) before:absolute before:-inset-2.5 before:content-[""]'
          aria-label='Dismiss Player'
        >
          <X className='h-3.5 w-3.5' />
        </button>
      </div>
    </section>
  );

  if (variant === 'legacy') {
    return legacyBar();
  }

  const shellTrack: AudioBarTrack = {
    id: activeTrackId,
    title: playbackState.trackTitle ?? '',
    artist: playbackState.artistName ?? '',
    hasLyrics: designV1LyricsEnabled && playbackState.hasLyrics,
  };
  const lyricsPath = buildLyricsRoute(activeTrackId);
  const nowPlayingTrack = {
    trackTitle: playbackState.trackTitle,
    artistName: playbackState.artistName,
    artworkUrl: playbackState.artworkUrl,
  };

  return (
    <>
      <div
        data-testid='audio-surface-expanded-shell'
        data-shell-audio-surface='persistent-expanded'
        aria-hidden={barCollapsed}
        className={cn(
          'hidden shrink-0 overflow-hidden border-t border-(--linear-app-shell-border) bg-(--linear-bg-page) lg:block',
          SHELL_AUDIO_CHROME_TRANSITION_CLASSNAME
        )}
        style={{
          maxHeight: barCollapsed
            ? 0
            : 'var(--linear-app-audio-bar-max-height)',
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
        <div className='px-8 pt-2'>
          <SidebarNowPlaying
            track={nowPlayingTrack}
            isPlaying={playbackState.isPlaying}
            onPlay={handleToggle}
            playOverlayVisible={false}
            className={SHELL_NOW_PLAYING_CARD_CLASSNAME}
          />
        </div>
        <AudioBar
          isPlaying={playbackState.isPlaying}
          onPlay={handleToggle}
          onPrevious={
            playbackState.hasPrevious
              ? () => playPrevious().catch(() => {})
              : undefined
          }
          onNext={
            playbackState.hasNext ? () => playNext().catch(() => {}) : undefined
          }
          onCollapse={() => setBarCollapsed(true)}
          currentTime={playbackState.currentTime}
          duration={playbackState.duration}
          onSeek={seek}
          waveformOn={waveformOn}
          onToggleWaveform={() => setWaveformOn(current => !current)}
          lyricsActive={pathname === lyricsPath}
          onOpenLyrics={
            designV1LyricsEnabled && playbackState.hasLyrics
              ? handleOpenLyrics
              : undefined
          }
          track={shellTrack}
        />
      </div>
      <div
        data-testid='audio-surface-compact-shell'
        data-shell-audio-surface='persistent-compact'
        aria-hidden={!barCollapsed}
        className={cn(
          'hidden shrink-0 overflow-hidden border-t border-(--linear-app-shell-border) bg-(--linear-app-content-surface) px-3 lg:block',
          SHELL_AUDIO_CHROME_TRANSITION_CLASSNAME
        )}
        style={{
          maxHeight: barCollapsed
            ? 'var(--linear-app-audio-compact-height)'
            : 0,
          opacity: barCollapsed ? 1 : 0,
          transform: barCollapsed ? 'translateY(0)' : 'translateY(8px)',
          pointerEvents: barCollapsed ? 'auto' : 'none',
          transition: SHELL_AUDIO_BAR_TRANSITION,
        }}
      >
        <SidebarBottomNowPlaying
          track={nowPlayingTrack}
          isPlaying={playbackState.isPlaying}
          onPlay={handleToggle}
          className={cn('my-2', SHELL_NOW_PLAYING_ROW_CLASSNAME)}
        />
      </div>
      {legacyBar('lg:hidden')}
    </>
  );
}
