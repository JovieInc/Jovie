'use client';

import { useCallback } from 'react';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { SidebarBottomNowPlaying } from '@/components/shell/SidebarBottomNowPlaying';
import { cn } from '@/lib/utils';
import { useAudioChromeSnapshot } from './audio-chrome-state';

/**
 * SidebarBottomNowPlayingBridge — production audio adapter for the shell
 * `SidebarBottomNowPlaying` atom inside `UnifiedSidebar`. Renders only when
 * there's an active track and no persistent audio surface (compact OR
 * full/expanded bar, in either shell variant) already owns the same
 * now-playing track (JOV-3511: never both at once).
 *
 * Ownership semantics: `PersistentAudioBar` publishes an audio-chrome
 * snapshot whenever it has an active track. An empty snapshot therefore
 * means no persistent bar is mounted, and the sidebar mini-player is the
 * canonical now-playing surface and stays visible. When a persistent
 * surface owns the track, the slot stays mounted at its fixed height in a
 * reserved state (opacity-0 + inert) so hiding never shifts layout.
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

  const persistentSurfaceOwnsTrack =
    audioChrome.activeTrackId === playbackState.activeTrackId &&
    (audioChrome.compactPlayerVisible || audioChrome.fullPlayerVisible);

  return (
    <div
      data-shell-audio-surface='sidebar-compact'
      data-state={persistentSurfaceOwnsTrack ? 'reserved' : 'visible'}
      aria-hidden={persistentSurfaceOwnsTrack}
      inert={persistentSurfaceOwnsTrack ? true : undefined}
      className={cn(
        'h-(--app-shell-audio-compact-height) overflow-hidden px-2 pb-2 pt-1 transition-[opacity,transform] duration-cinematic ease-cinematic',
        persistentSurfaceOwnsTrack
          ? 'pointer-events-none opacity-0'
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
        className='border border-(--app-shell-border)/75 bg-(--app-shell-content-surface) shadow-[0_10px_24px_rgba(0,0,0,0.12)] transition-[opacity,transform,border-color,background-color] duration-cinematic ease-cinematic'
      />
    </div>
  );
}
