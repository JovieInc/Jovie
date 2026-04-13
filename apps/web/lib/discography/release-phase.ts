/**
 * Determines the current phase of a release based on its dates.
 *
 * Phases:
 * - 'mystery': revealDate is in the future (details hidden)
 * - 'revealed': revealDate has passed but releaseDate is in the future (details visible, countdown to release)
 * - 'released': releaseDate has passed or no dates set (full page)
 */
export function determineReleasePhase(
  releaseDate: string | Date | null | undefined,
  revealDate: string | Date | null | undefined,
  now?: Date
): 'mystery' | 'revealed' | 'released' {
  const currentTime = now ?? new Date();

  // If revealDate is in the future, we're in mystery phase
  if (revealDate && new Date(revealDate) > currentTime) {
    return 'mystery';
  }

  // If releaseDate is in the future (and revealDate has passed or is null), we're revealed
  if (releaseDate && new Date(releaseDate) > currentTime) {
    return 'revealed';
  }

  // Otherwise, the release is fully out
  return 'released';
}
