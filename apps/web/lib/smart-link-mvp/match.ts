/** Compare catalog text without treating a remix or a different artist as the same song. */

export function normalizeMusicText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function splitArtistTitle(
  query: string
): { readonly artist: string; readonly title: string } | null {
  const parts = query.split(/\s+-\s+/);
  if (parts.length < 2) return null;
  const artist = parts[0]?.trim() ?? '';
  const title = parts.slice(1).join(' - ').trim();
  if (!artist || !title) return null;
  return { artist, title };
}

function sameArtist(expected: string, found: string): boolean {
  if (!expected || !found) return false;
  if (expected === found) return true;
  const stripThe = (value: string) => value.replace(/^the /, '');
  return stripThe(expected) === stripThe(found);
}

/** True only when the title is the same recording, not a remix, live, or demo cut. */
export function sameRecording(
  expected: { readonly artist: string; readonly title: string },
  found: { readonly artist: string; readonly title: string }
): boolean {
  const artist = normalizeMusicText(expected.artist);
  const title = normalizeMusicText(expected.title);
  const foundArtist = normalizeMusicText(found.artist);
  const foundTitle = normalizeMusicText(found.title);
  return (
    sameArtist(artist, foundArtist) && title === foundTitle && title !== ''
  );
}
