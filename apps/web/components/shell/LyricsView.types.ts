import type { TimedTextCue } from '@jovie/audio-contracts';

/** Canonical timed lyric cue shared with server and native consumers. */
export type LyricLine = TimedTextCue;

export interface LyricsViewTrack {
  readonly title: string;
  readonly artist: string;
}
