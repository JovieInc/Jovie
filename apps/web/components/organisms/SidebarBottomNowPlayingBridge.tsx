'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback } from 'react';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { SidebarBottomNowPlaying } from '@/components/shell/SidebarBottomNowPlaying';

/**
 * SidebarBottomNowPlayingBridge — production audio adapter for the shell
 * `SidebarBottomNowPlaying` atom inside `UnifiedSidebar`. The sidebar owns
 * track identity for every active track while the bottom bar owns transport.
 *
 * Adapter: production `useTrackAudioPlayer().playbackState` →
 * `NowPlayingTrack` (trackTitle / artistName / artworkUrl). Tap-to-play
 * routes through the same `toggleTrack(...)` call as the audio bar so the
 * sidebar mini-player and the persistent bar stay in sync.
 */
export function SidebarBottomNowPlayingBridge({
  collapsed = false,
}: Readonly<{ collapsed?: boolean }>) {
  const { playbackState, stop, toggleTrack } = useTrackAudioPlayer();
  const prefersReducedMotion = useReducedMotion();

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
  return (
    <AnimatePresence initial={false}>
      {hasActiveTrack ? (
        <motion.div
          key={playbackState.activeTrackId}
          data-shell-audio-surface='sidebar-now-playing'
          initial={
            prefersReducedMotion
              ? false
              : { opacity: 0, transform: 'translateY(8px)' }
          }
          animate={{ opacity: 1, transform: 'translateY(0)' }}
          exit={
            prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, transform: 'translateY(8px)' }
          }
          transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
          className='overflow-visible px-2 py-1'
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
            collapsed={collapsed}
            className='border-0 bg-transparent shadow-none'
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
