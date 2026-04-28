'use client';

import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { AudioBar } from '@/components/shell/AudioBar';

/**
 * ShellAudioBarBridge — flag-on path for the audio player slot.
 *
 * Renders the production shell `AudioBar` atom against the existing
 * `useTrackAudioPlayer()` global. Replaces the compact preview-style
 * `PersistentAudioBar` when `SHELL_CHAT_V1` is on. Adapter handles the
 * `playbackState` → `AudioBarTrack` field rename.
 *
 * Notes on feature parity:
 * - Production has no per-track cue data yet, so `cues` is left undefined.
 * - Loop modes (`track`/`section`) aren't wired to the audio element here;
 *   the AudioBar renders the toggle but cycling is a no-op until the
 *   `useTrackAudioPlayer` hook gains loop semantics.
 * - Waveform toggle is local visual state — production doesn't render
 *   per-track waveform strands yet (the shell AudioBar handles its own
 *   scrub gradient).
 * - Lyrics toggle becomes a no-op until the lyrics-route deeplink is wired.
 */
export function ShellAudioBarBridge() {
  const {
    playbackState,
    toggleTrack,
    seek: _seek,
    stop,
    onError,
  } = useTrackAudioPlayer();

  useEffect(() => {
    return onError(() => {
      toast.error('Preview unavailable', { id: 'audio-preview-error' });
    });
  }, [onError]);

  const handlePlay = useCallback(() => {
    if (!playbackState.activeTrackId || !playbackState.trackTitle) return;
    toggleTrack({
      id: playbackState.activeTrackId,
      title: playbackState.trackTitle,
    }).catch(() => {});
  }, [playbackState.activeTrackId, playbackState.trackTitle, toggleTrack]);

  if (!playbackState.activeTrackId || !playbackState.trackTitle) return null;

  return (
    <AudioBar
      isPlaying={playbackState.isPlaying}
      onPlay={handlePlay}
      onCollapse={stop}
      currentTime={playbackState.currentTime}
      duration={playbackState.duration}
      loopMode='off'
      onCycleLoop={() => {
        /* loop semantics not yet wired in useTrackAudioPlayer */
      }}
      waveformOn={false}
      onToggleWaveform={() => {
        /* waveform-toggle persistence not yet wired */
      }}
      lyricsActive={false}
      track={{
        id: playbackState.activeTrackId,
        title: playbackState.trackTitle,
        artist: playbackState.artistName ?? '',
      }}
    />
  );
}
