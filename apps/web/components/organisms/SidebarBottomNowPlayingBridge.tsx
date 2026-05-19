'use client';

import { useCallback } from 'react';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { SidebarBottomNowPlaying } from '@/components/shell/SidebarBottomNowPlaying';
import { useAppFlag } from '@/lib/flags/client';
import { useAudioChromeSnapshot } from './audio-chrome-state';

/**
 * SidebarBottomNowPlayingBridge — flag-gated mount of the shell
 * `SidebarBottomNowPlaying` atom inside `UnifiedSidebar`. Renders only when
 * DESIGN_V1 is on AND there's an active track.
 *
 * Adapter: production `useTrackAudioPlayer().playbackState` →
 * `NowPlayingTrack` (trackTitle / artistName / artworkUrl). Tap-to-play
 * routes through the same `toggleTrack(...)` call as the audio bar so the
 * sidebar mini-player and the persistent bar stay in sync.
 */
export function SidebarBottomNowPlayingBridge() {
  const shellChatV1Enabled = useAppFlag('DESIGN_V1');
  const audioChrome = useAudioChromeSnapshot();
  const { playbackState, toggleTrack } = useTrackAudioPlayer();

  const handlePlay = useCallback(() => {
    if (!playbackState.activeTrackId || !playbackState.trackTitle) return;
    toggleTrack({
      id: playbackState.activeTrackId,
      title: playbackState.trackTitle,
    }).catch(() => {});
  }, [playbackState.activeTrackId, playbackState.trackTitle, toggleTrack]);

  if (!shellChatV1Enabled) return null;
  if (!playbackState.activeTrackId || !playbackState.trackTitle) return null;
  if (
    audioChrome.compactPlayerVisible &&
    audioChrome.activeTrackId === playbackState.activeTrackId
  ) {
    return null;
  }

  return (
    <div
      data-shell-audio-surface='sidebar-compact'
      className='px-2 pb-2 pt-1 transition-[opacity,transform] duration-cinematic ease-cinematic'
    >
      <SidebarBottomNowPlaying
        track={{
          trackTitle: playbackState.trackTitle,
          artistName: playbackState.artistName,
          artworkUrl: playbackState.artworkUrl,
        }}
        isPlaying={playbackState.isPlaying}
        onPlay={handlePlay}
        className='border border-(--linear-app-shell-border)/75 bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,var(--linear-bg-surface-0))] shadow-[0_10px_24px_rgba(0,0,0,0.12)] transition-[opacity,transform,border-color,background-color] duration-cinematic ease-cinematic'
      />
    </div>
  );
}
