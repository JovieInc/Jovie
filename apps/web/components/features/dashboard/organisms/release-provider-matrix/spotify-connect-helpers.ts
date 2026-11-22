import type { SpotifyArtistResult as SpotifyArtist } from '@/lib/queries';

export function canSelectArtist(artist: SpotifyArtist): boolean {
  return !artist.isClaimed || artist.isClaimedByCurrentUser === true;
}

export function getNextSelectableIndex(
  activeIndex: number,
  direction: 1 | -1,
  results: SpotifyArtist[]
): number {
  const startIndex =
    activeIndex >= 0 ? activeIndex : direction === 1 ? -1 : results.length;
  for (let offset = 1; offset <= results.length; offset += 1) {
    const nextIndex =
      (startIndex + direction * offset + results.length) % results.length;
    if (results[nextIndex] && canSelectArtist(results[nextIndex])) {
      return nextIndex;
    }
  }
  return -1;
}

export function isSpotifyUrl(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith('https://open.spotify.com/') ||
    trimmed.startsWith('open.spotify.com/') ||
    trimmed.startsWith('spotify.com/')
  );
}
