'use client';

import { useCallback } from 'react';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { SidebarBottomNowPlaying } from '@/components/shell/SidebarBottomNowPlaying';
import { cn } from '@/lib/utils';
import { useAudioChromeSnapshot } from './audio-chrome-state';

/**
 * SidebarBottomNowPlayingBridge — production audio adapter for the shell
 * `SidebarBottomNowPlaying` atom inside `UnifiedSidebar`. Renders only when
 * there's an active track and the persistent compact player does not already
 * own the same now-playing surface.
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

  const compactPlayerOwnsTrack =
    audioChrome.compactPlayerVisible &&
    audioChrome.activeTrackId === playbackState.activeTrackId;

  return (
    <div
      data-shell-audio-surface='sidebar-compact'
      data-state={compactPlayerOwnsTrack ? 'reserved' : 'visible'}
      aria-hidden={compactPlayerOwnsTrack}
      className={cn(
        'h-(--linear-app-audio-compact-height) overflow-hidden px-2 pb-2 pt-1 transition-[opacity,transform] duration-cinematic ease-cinematic',
        compactPlayerOwnsTrack
          ? 'pointer-events-none invisible opacity-0'
          : 'opacity-100'
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
        className='border border-(--linear-app-shell-border)/75 bg-(--linear-app-content-surface) shadow-[0_10px_24px_rgba(0,0,0,0.12)] transition-[opacity,transform,border-color,background-color] duration-cinematic ease-cinematic'
      />
    </div>
  );
}
