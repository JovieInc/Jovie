interface ArtistContextSpotify {
  readonly spotifyUrl?: string | null;
  readonly spotifyFollowers: number | null;
  readonly spotifyPopularity: number | null;
}

/** Connection state is its own fact: a null follower count is not "Not connected". */
export function spotifyConnectionLine(context: ArtistContextSpotify): string {
  const connected =
    Boolean(context.spotifyUrl) ||
    context.spotifyFollowers !== null ||
    context.spotifyPopularity !== null;
  return connected
    ? `Connected${context.spotifyUrl ? ` (${context.spotifyUrl})` : ''}`
    : 'Not connected';
}
