/**
 * Shared cue types — used by CuesPanel (drawer body) and RowWaveform
 * (inline scrubber) so a single cue shape flows through both surfaces.
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
