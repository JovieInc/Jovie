/**
 * Each strategy deliberately occupies a different visual lane. Keep the
 * fields separate so adjective-only changes cannot collapse the options into
 * the same composition again.
 */
export interface MerchDesignStrategy {
  readonly label: string;
  readonly composition: string;
  readonly typographyRole: string;
  readonly motifSystem: string;
  readonly palette: string;
  readonly density: string;
}

export const MERCH_DESIGN_STRATEGIES: readonly MerchDesignStrategy[] = [
  {
    label: 'Signal Field',
    composition:
      'an offset left-to-right signal field with one dominant graphic band and intentional open space',
    typographyRole:
      'artist name as a small signature line, with the verified source phrase as the primary readable type',
    motifSystem:
      'abstract pulse lines, register marks, and measured signal fragments only',
    palette: 'ink black, bone, and one electric blue accent',
    density: 'medium density with a clear quiet margin',
  },
  {
    label: 'Archive Stamp',
    composition:
      'a compact centered archival seal with a broad empty outer field, not a poster layout',
    typographyRole:
      'verified source phrase set as small circular utility type, artist name as a secondary catalog credit',
    motifSystem:
      'abstract catalog notches, concentric rings, and a single geometric identifier',
    palette: 'one-color charcoal print with no secondary accent',
    density: 'minimal density with large negative space',
  },
  {
    label: 'Night Transit',
    composition:
      'a wide horizontal transit strip across the lower third, leaving the upper field deliberately empty',
    typographyRole:
      'artist name as a wide wordmark, verified source phrase as a short route label beneath it',
    motifSystem:
      'abstract route geometry, timing ticks, and directional arrows without place names or dates',
    palette: 'deep charcoal, silver gray, and restrained violet',
    density: 'medium-high density confined to the lower strip',
  },
  {
    label: 'Editorial Cut',
    composition:
      'a vertical editorial split with the image language concentrated in one narrow side column',
    typographyRole:
      'verified source phrase as the hero typographic crop, artist name as a small byline',
    motifSystem:
      'abstract crop marks, halftone texture, and one cut-paper shape',
    palette: 'black, soft white, and one muted pink accent',
    density: 'high contrast with controlled medium density',
  },
  {
    label: 'Object Study',
    composition:
      'one isolated abstract object centered low on the canvas with a large unprinted field above',
    typographyRole:
      'artist name as compact utility type, verified source phrase as a caption adjacent to the object',
    motifSystem:
      'one non-figurative geometric object built from the source phrase initials, never a logo recreation',
    palette: 'black and off-white only',
    density: 'minimal density',
  },
  {
    label: 'Type Stack',
    composition:
      'a tall stacked type system filling the center column with no illustrative scene',
    typographyRole:
      'verified source phrase and artist name share equal typographic weight in distinct lines',
    motifSystem:
      'simple rule lines and typographic spacing only, no icons or symbolic illustration',
    palette: 'ink black with one restrained orange registration mark',
    density: 'typography-dense but visually spare',
  },
];
