/**
 * Determines the current phase of a release based on its dates.
 *
 * Phases:
 * - 'mystery': no public release date, or announce date has not passed
 * - 'revealed': announce date has passed but release date is in the future
 * - 'released': release date has passed
 */
export function determineReleasePhase(
  releaseDate: string | Date | null | undefined,
  revealDate: string | Date | null | undefined,
  now?: Date
): 'mystery' | 'revealed' | 'released' {
  const currentTime = now ?? new Date();

  if (!releaseDate) {
    return 'mystery';
  }

  const resolvedReleaseDate = new Date(releaseDate);
  if (Number.isNaN(resolvedReleaseDate.getTime())) {
    return 'mystery';
  }

  if (resolvedReleaseDate <= currentTime) {
    return 'released';
  }

  if (!revealDate) {
    return 'mystery';
  }

  const resolvedRevealDate = new Date(revealDate);
  if (
    Number.isNaN(resolvedRevealDate.getTime()) ||
    resolvedRevealDate > currentTime
  ) {
    return 'mystery';
  }

  return 'revealed';
}
