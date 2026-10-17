/** MusicFetch's artist image is shared reference artwork, not a DSP observation. */
export function getDspArtistImageUrl(match: {
  readonly matchSource?: string | null;
  readonly externalArtistImageUrl?: string | null;
}): string | null {
  return match.matchSource === 'musicfetch'
    ? null
    : (match.externalArtistImageUrl ?? null);
}
