/**
 * Artist-outbound entity check. Link-in-bio discovery also finds playlist
 * curators, submission services, labels, distributors and media pages; they
 * are not artists, so they must not reach "Ready to certify".
 *
 * Warn-only by design (2026-10-21): a match is a *possible* non-artist. The
 * lead stays in the pipeline under a flag for Tim to reject or keep; nothing
 * here disqualifies, rejects or deletes. Known misses (e.g. a distributor
 * with a plain brand handle such as `ingrooves`) stay unflagged.
 */

export type NonArtistKind = 'curator' | 'label' | 'media';

export interface EntitySignalInput {
  readonly handle: string;
  readonly displayName: string | null;
  readonly bio: string | null;
}

/** Handle shapes that name a business, matched as a suffix or stem. */
const HANDLE_PATTERNS: readonly [RegExp, NonArtistKind][] = [
  [/(playlist|curator|submission)/i, 'curator'],
  [/(distribution|records|recordings|discos|enterprises)$/i, 'label'],
  [/(media|mediahub|promo|promotions)$/i, 'media'],
];

/** Words in the public name or bio that describe a business, not an artist. */
const TEXT_PATTERNS: readonly [RegExp, NonArtistKind][] = [
  [/\b(playlists?|playlister|curators?|submissions?)\b/i, 'curator'],
  [
    /\b((record|music)\s+label|distribution|distributor|music\s+distro)\b/i,
    'label',
  ],
];

export const NON_ARTIST_KIND_LABELS: Record<NonArtistKind, string> = {
  curator: 'Looks like a playlist curator or submission service',
  label: 'Looks like a label or distributor',
  media: 'Looks like a media or promo page',
};

/** The first non-artist signal on a lead, or null when none matched. */
export function possibleNonArtist(
  input: EntitySignalInput
): NonArtistKind | null {
  const handle = input.handle.replace(/^@+/, '').trim();
  for (const [pattern, kind] of HANDLE_PATTERNS)
    if (pattern.test(handle)) return kind;
  const text = [input.displayName, input.bio].filter(Boolean).join(' \n ');
  for (const [pattern, kind] of TEXT_PATTERNS)
    if (pattern.test(text)) return kind;
  return null;
}
