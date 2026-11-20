/**
 * Whether the artist's public page has a way to stream them. The public
 * profile renders the profile's Spotify/Apple Music URLs and every release's
 * listen links (provider_links), not only DSP rows in social_links. Deriving
 * the chat fact from social_links alone made the model say "your link-in-bio
 * has no music links" about a page showing a featured release with "Listen
 * now" (prod walk 2026-10-31).
 */
export function resolveHasMusicLinks(input: {
  readonly dspSocialLinkCount: number;
  readonly releaseListenLinkCount: number;
  readonly spotifyUrl?: string | null;
  readonly appleMusicUrl?: string | null;
}): boolean {
  return (
    input.dspSocialLinkCount > 0 ||
    input.releaseListenLinkCount > 0 ||
    Boolean(input.spotifyUrl?.trim()) ||
    Boolean(input.appleMusicUrl?.trim())
  );
}
