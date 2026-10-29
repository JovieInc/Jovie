/**
 * Tim White's demo catalog, dependency-free so marketing routes can import it
 * without pulling in the full profile preview fixture.
 */
const DAY_MS = 86_400_000;

/**
 * Past release dates anchored the same way as `upcomingShowDate`: a fixed
 * number of days before the Monday (UTC) of the current week, so the demo
 * catalog stays recent and agrees with captures on the capture clock.
 */
function pastReleaseDate(daysBeforeMonday: number): string {
  const today = Math.floor(Date.now() / DAY_MS);
  const monday = today - ((today + 3) % 7);
  return new Date((monday - daysBeforeMonday) * DAY_MS).toISOString();
}

/**
 * Tim White's catalog as the product shows it (releases dashboard capture:
 * The Deep End 36d, Never Say a Word 78d, Take Me Over 211d), newest first,
 * with the real cover art.
 */
export const HOMEPAGE_PROFILE_PREVIEW_CATALOG = [
  {
    title: 'The Deep End',
    releaseType: 'Single',
    artistNames: ['Tim White', 'Cosmic Gate'],
    artworkUrl: '/img/releases/the-deep-end.jpg',
    releaseDate: pastReleaseDate(36),
  },
  {
    title: 'Never Say a Word',
    releaseType: 'Video',
    artistNames: ['Tim White'],
    artworkUrl: '/img/releases/never-say-a-word.jpg',
    releaseDate: pastReleaseDate(78),
  },
  {
    title: 'Take Me Over',
    releaseType: 'Single',
    artistNames: ['Tim White'],
    artworkUrl: '/img/releases/take-me-over.jpg',
    releaseDate: pastReleaseDate(211),
  },
] as const;
