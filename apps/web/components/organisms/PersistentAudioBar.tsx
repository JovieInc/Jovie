'use client';

import { ChevronDown, ChevronUp, Play } from 'lucide-react';
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
// Flat player (founder spec 2026-09-25 #1): no border to transition anymore.
const SHELL_AUDIO_CHROME_TRANSITION_CLASSNAME =
  'transition-[max-height,opacity,transform,background-color] duration-cinematic ease-cinematic';
/** Docked now-playing chip — flat, no elevation into the content canvas (JOV-3511). */
const SHELL_NOW_PLAYING_CARD_CLASSNAME =
  'max-w-56 border-0 bg-transparent px-1 py-1 shadow-none transition-[opacity] duration-cinematic ease-cinematic';

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
  const { playbackState, toggleTrack, playNext, playPrevious, seek, onError } =
    useTrackAudioPlayer();
  const prefersReducedMotion = useReducedMotion();
  const [imgError, setImgError] = useState(false);
  // Compact is the default surface for an active track (founder spec
  // 2026-09-25). The bottom-right PlayerVisibilityToggle opens/closes it;
  // there is no idle tray — the player is simply absent until a track loads.
  const [playerOpen, setPlayerOpen] = useState(true);
  const [waveformOn, setWaveformOn] = useState(false);
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
    setPlayerOpen(true);
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
    if (!hasActiveTrack || !activeTrackId) {
      resetAudioChromeSnapshot();
      return;
    }

    setAudioChromeSnapshot({
      activeTrackId,
      compactPlayerVisible,
      fullPlayerVisible: !compactPlayerVisible,
    });
  }, [activeTrackId, compactPlayerVisible, hasActiveTrack]);

  useEffect(() => {
    return resetAudioChromeSnapshot;
  }, []);

  if (!hasActiveTrack || !activeTrackId) {
    // Idle: player absent, zero reserved space, no layout shift of main
    // content (founder spec 2026-09-25 #5). There is nothing to toggle open.
    return null;
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
  const nowPlayingTrack = {
    trackTitle: playbackState.trackTitle,
    artistName: playbackState.artistName,
    artworkUrl: playbackState.artworkUrl,
  };

  return (
    <>
      {/* Desktop player host — sits below main content, sharing its surface
          tone (flat: no separate card border/radius/shadow). The visibility
          toggle is always present here so a closed player can be reopened;
          the bar itself collapses to 0 height when closed and the sidebar
          mini takes over (JOV-3511: never full + mini at once). */}
      <div className='hidden shrink-0 bg-(--app-shell-content-surface) lg:block'>
        <div className='flex items-center justify-end px-4 py-1 lg:px-6'>
          <PlayerVisibilityToggle
            open={playerOpen}
            onClick={() => setPlayerOpen(value => !value)}
          />
        </div>
        <div
          data-testid='audio-surface-expanded-shell'
          data-shell-audio-surface='persistent-expanded'
          aria-hidden={!playerOpen}
          className={cn(
            'overflow-hidden',
            SHELL_AUDIO_CHROME_TRANSITION_CLASSNAME
          )}
          style={{
            maxHeight: playerOpen ? 'var(--app-shell-audio-bar-max-height)' : 0,
            opacity: revealed && playerOpen ? 1 : 0,
            transform: prefersReducedMotion
              ? 'translateY(0)'
              : !revealed
                ? 'translateY(100%)'
                : playerOpen
                  ? 'translateY(0)'
                  : 'translateY(10px)',
            // Keyed on open state only — the reveal is purely visual
            // (transform + opacity), so the bar stays interactive the
            // instant it mounts rather than waiting out the slide-in.
            pointerEvents: playerOpen ? 'auto' : 'none',
            transition: prefersReducedMotion
              ? 'none'
              : SHELL_AUDIO_BAR_TRANSITION,
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
            sidebar bridge when the player is closed (JOV-3511). Kept as a
            zero-height slot so tests and chrome-state consumers still see
            the transition without a second visible player. */}
        <div
          data-testid='audio-surface-compact-shell'
          data-shell-audio-surface='persistent-compact'
          aria-hidden={playerOpen}
          className={cn(
            'overflow-hidden',
            SHELL_AUDIO_CHROME_TRANSITION_CLASSNAME
          )}
          style={{
            maxHeight: 0,
            opacity: 0,
            pointerEvents: 'none',
            transition: SHELL_AUDIO_BAR_TRANSITION,
          }}
        />
      </div>
      {mobileBar('lg:hidden')}
    </>
  );
}
