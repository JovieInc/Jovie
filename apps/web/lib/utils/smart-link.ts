/** Parse a legacy smart link slug in the format {releaseSlug}--{profileId} */
export function parseSmartLinkSlug(
  slug: string
): { releaseSlug: string; profileId: string } | null {
  const separator = '--';
  const lastSeparatorIndex = slug.lastIndexOf(separator);

  if (lastSeparatorIndex === -1) {
    return null;
  }

  const releaseSlug = slug.slice(0, lastSeparatorIndex);
  const profileId = slug.slice(lastSeparatorIndex + separator.length);

  if (!releaseSlug || !profileId) {
    return null;
  }

  return { releaseSlug, profileId };
}
