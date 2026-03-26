export const DSP_ARTIST_DISCOVERY_PROVIDERS = [
  'apple_music',
  'deezer',
  'musicbrainz',
] as const;

export type DspArtistDiscoveryProvider =
  (typeof DSP_ARTIST_DISCOVERY_PROVIDERS)[number];

export const DEFAULT_DSP_ARTIST_DISCOVERY_PROVIDERS = [
  ...DSP_ARTIST_DISCOVERY_PROVIDERS,
];
