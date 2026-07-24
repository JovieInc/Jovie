'use client';

import { useCallback } from 'react';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { SidebarBottomNowPlaying } from '@/components/shell/SidebarBottomNowPlaying';
import { cn } from '@/lib/utils';
import { useAudioChromeSnapshot } from './audio-chrome-state';

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
export function SidebarBottomNowPlayingBridge() {
  const audioChrome = useAudioChromeSnapshot();
  const { playbackState, toggleTrack } = useTrackAudioPlayer();

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

  return (
    <div
      data-shell-audio-surface='sidebar-compact'
      data-state={fullPlayerOwnsTrack ? 'reserved' : 'visible'}
      aria-hidden={fullPlayerOwnsTrack}
      inert={fullPlayerOwnsTrack ? true : undefined}
      className={cn(
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
        className='border-0 bg-transparent shadow-none transition-[opacity,transform,background-color] duration-cinematic ease-cinematic'
      />
    </div>
  );
}
