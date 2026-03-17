const formatReleaseLabel = (count: number) =>
  `${count} release${count === 1 ? '' : 's'}`;

export function getSpotifyImportStageMessage(
  stage: 0 | 1 | 2,
  importedReleases?: number
): string {
  if (stage === 0) {
    return 'Finding your Spotify artist profile…';
  }

  if (stage === 1) {
    if (typeof importedReleases === 'number') {
      return `Importing ${formatReleaseLabel(importedReleases)} and your artist profile…`;
    }

    return 'Importing your releases and artist profile…';
  }

  return 'Setting up your smartlinks…';
}

export function getSpotifyImportSuccessMessage(
  importedReleases: number
): string {
  return `Imported your artist profile and ${formatReleaseLabel(importedReleases)} from Spotify.`;
}
