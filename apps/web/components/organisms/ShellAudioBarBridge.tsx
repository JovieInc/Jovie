'use client';

import { useCallback, useEffect, useState } from 'react';
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
 * - Loop modes (`track`/`section`) are omitted until `useTrackAudioPlayer`
 *   gains loop semantics.
 * - Waveform toggle is local visual state. The shell AudioBar renders the
 *   scrub gradient from the current playback time and duration.
 */
export function ShellAudioBarBridge() {
  const { playbackState, toggleTrack, stop, onError } = useTrackAudioPlayer();
  const [waveformOn, setWaveformOn] = useState(false);

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
      waveformOn={waveformOn}
      onToggleWaveform={() => setWaveformOn(current => !current)}
      lyricsActive={false}
      track={{
        id: playbackState.activeTrackId,
        title: playbackState.trackTitle,
        artist: playbackState.artistName ?? '',
      }}
    />
  );
}
