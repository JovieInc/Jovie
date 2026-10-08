'use client';

import { useCallback, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { SidebarBottomNowPlaying } from '@/components/shell/SidebarBottomNowPlaying';
import { cn } from '@/lib/utils';
import {
  requestFullAudioPlayer,
  useAudioChromeSnapshot,
} from './audio-chrome-state';

/**
 * SidebarBottomNowPlayingBridge — production audio adapter for the shell
 * `SidebarBottomNowPlaying` atom inside `UnifiedSidebar`. This is the MINI
 * player. It renders only when the full bottom bar is hidden (minimized);
 * full + mini never co-reside (JOV-3511).
 *
 * Adapter: production `useTrackAudioPlayer().playbackState` →
 * `NowPlayingTrack` (trackTitle / artistName / artworkUrl). Tap-to-play
 * routes through the same `toggleTrack(...)` call as the audio bar so the
 * sidebar mini-player and the persistent bar stay in sync.
 */
export function SidebarBottomNowPlayingBridge({
  collapsed = false,
  detached = false,
}: Readonly<{ collapsed?: boolean; detached?: boolean }>) {
  const [dockBottom, setDockBottom] = useState(8);
  useLayoutEffect(() => {
    if (!detached) return;
    let composer: HTMLElement | null = null;
    const update = () => {
      const rect = composer?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const visibleBottom = viewport
        ? viewport.offsetTop + viewport.height
        : innerHeight;
      const toolbar =
        document.querySelector<HTMLElement>(
          'html[data-desktop-runtime="electron"] [data-electron-titlebar="true"]'
        ) ??
        document.querySelector<HTMLElement>('[data-app-shell-header="true"]');
      const top = Math.max(
        (toolbar?.getBoundingClientRect().bottom ?? 0) + 8,
        (viewport?.offsetTop ?? 0) + 8
      );
      const maxBottom = Math.max(8, innerHeight - top - 64);
      // The independent media dock stays above real composer controls.
      setDockBottom(
        Math.min(
          maxBottom,
          Math.max(
            8,
            innerHeight - visibleBottom + 8,
            rect && rect.width > 0 && rect.left < 252 && rect.right > 8
              ? innerHeight - rect.top + 8
              : 8
          )
        )
      );
    };
    const resize = new ResizeObserver(update);
    const attach = () => {
      const next = document.querySelector<HTMLElement>(
        '[data-testid="chat-composer-surface"]'
      );
      if (next === composer) return;
      if (composer) resize.unobserve(composer);
      composer = next;
      if (composer) resize.observe(composer);
      update();
    };
    const mutation = new MutationObserver(attach);
    mutation.observe(document.body, { childList: true, subtree: true });
    attach();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [detached]);
  const audioChrome = useAudioChromeSnapshot();
  const { playbackState, stop, toggleTrack } = useTrackAudioPlayer();

  const handlePlay = useCallback(() => {
    if (!playbackState.activeTrackId || !playbackState.trackTitle) return;
    toggleTrack({
      id: playbackState.activeTrackId,
      title: playbackState.trackTitle,
    }).catch(() => {});
  }, [playbackState.activeTrackId, playbackState.trackTitle, toggleTrack]);

  const hasActiveTrack = Boolean(
    playbackState.activeTrackId && playbackState.trackTitle
  );
  if (!hasActiveTrack) return null;

  // Mini (sidebar) yields while the full docked bar owns this track.
  // When the full bar is minimized, the mini becomes the sole chrome.
  const fullPlayerOwnsTrack =
    audioChrome.fullPlayerVisible &&
    audioChrome.activeTrackId === playbackState.activeTrackId;

  const surface = (
    <div
      style={detached ? { bottom: dockBottom } : undefined}
      data-rail-owned-overlay='left'
      data-shell-audio-surface='sidebar-compact'
      data-state={fullPlayerOwnsTrack ? 'reserved' : 'visible'}
      aria-hidden={fullPlayerOwnsTrack}
      inert={fullPlayerOwnsTrack ? true : undefined}
      className={cn(
        detached &&
          'fixed bottom-2 left-2 z-30 w-(--app-shell-sidebar-width) rounded-lg border border-subtle bg-sidebar shadow-lg',
        'h-(--app-shell-audio-compact-height) overflow-hidden px-2 pb-2 pt-1 transition-[opacity,transform] duration-cinematic ease-cinematic',
        fullPlayerOwnsTrack ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <SidebarBottomNowPlaying
        track={{
          trackTitle: playbackState.trackTitle,
          artistName: playbackState.artistName,
          artworkUrl: playbackState.artworkUrl,
        }}
        isPlaying={playbackState.isPlaying}
        onPlay={handlePlay}
        onDismiss={stop}
        onExpand={requestFullAudioPlayer}
        collapsed={detached ? false : collapsed}
        className='border-0 bg-transparent shadow-none transition-[opacity,transform,background-color] duration-cinematic ease-cinematic'
      />
    </div>
  );
  return detached && typeof document !== 'undefined'
    ? createPortal(surface, document.body)
    : surface;
}
