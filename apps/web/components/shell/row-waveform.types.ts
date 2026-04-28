/**
 * Shared types for the shell RowWaveform component.
 *
 * Lives in its own module so callers can build cue/datum state without
 * dragging in the JSX runtime, and so sibling components stay decoupled.
 */

export type CueKind =
  | 'intro'
  | 'verse'
  | 'chorus'
  | 'drop'
  | 'bridge'
  | 'outro';

export interface Cue {
  /** Time offset into the track in seconds. */
  readonly at: number;
  readonly kind: CueKind;
  readonly label: string;
}

/**
 * Minimum data shape required to render a `<RowWaveform>`. The id and
 * title are used for the slider's accessibility name and for stable
 * cue React keys; durationSec drives both the playhead and the seek
 * math; waveformSeed is a deterministic input that produces the
 * synthesised peaks (so the same track always paints the same shape).
 */
export interface RowWaveformDatum {
  readonly id: string;
  readonly title: string;
  readonly durationSec: number;
  readonly waveformSeed: number;
  readonly cues: readonly Cue[];
}
