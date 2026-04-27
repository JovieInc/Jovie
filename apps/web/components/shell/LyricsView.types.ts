/** A single timed lyric line. `startSec` is the cue point (seconds into the track). */
export interface LyricLine {
  readonly startSec: number;
  readonly text: string;
}

export interface LyricsViewTrack {
  readonly title: string;
  readonly artist: string;
}
