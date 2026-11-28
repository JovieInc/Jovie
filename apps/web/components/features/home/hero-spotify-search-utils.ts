import { extractSpotifyArtistId } from '@/lib/spotify/artist-id';

export function formatFollowers(count: number | undefined): string {
  if (!count) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M followers`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K followers`;
  return `${count} followers`;
}

/**
 * Detect if a string looks like a Spotify URL.
 */
export function isSpotifyUrl(value: string): boolean {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith('open.spotify.com/')
    ? `https://${trimmed}`
    : trimmed.startsWith('spotify.com/')
      ? `https://open.${trimmed}`
      : trimmed;
  return (
    normalized.startsWith('https://open.spotify.com/') &&
    extractSpotifyArtistId(normalized) !== null
  );
}
