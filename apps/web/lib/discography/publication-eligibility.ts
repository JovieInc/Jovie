/**
 * Publication eligibility for ingested releases that have no approval row.
 *
 * - publish: provider-verified identity (provider album id, owner is a credited
 *   album artist by provider id) and not an ambiguous duplicate.
 * - review: anything ambiguous (no provider id, owner not credited by id, or
 *   a same-title/same-artists/same-date sibling with another provider id).
 *   These go to the existing `needs_review` queue; nothing is published.
 * Artist decisions are never touched: releases that already have an approval
 * row (including hidden/archived) are not candidates at all.
 */

export interface PublicationCandidate {
  readonly id: string;
  readonly title: string;
  readonly releaseDate: Date | null;
  readonly metadata: unknown;
}

export type PublicationDecision = 'publish' | 'review';

function parse(metadata: unknown): {
  spotifyId: string | null;
  artistIds: string[];
} {
  const record =
    metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>)
      : {};
  const artists = Array.isArray(record.spotifyArtists)
    ? record.spotifyArtists
    : [];
  return {
    spotifyId:
      typeof record.spotifyId === 'string' && record.spotifyId.trim() !== ''
        ? record.spotifyId
        : null,
    artistIds: artists
      .map(a =>
        a && typeof a === 'object' ? (a as { id?: unknown }).id : null
      )
      .filter((id): id is string => typeof id === 'string' && id !== ''),
  };
}

const norm = (value: string) =>
  value
    .normalize('NFKD')
    .replaceAll(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

export function classifyForPublication(
  candidate: PublicationCandidate,
  allReleases: readonly PublicationCandidate[],
  ownerSpotifyId: string | null
): PublicationDecision {
  const own = parse(candidate.metadata);
  if (!own.spotifyId || !ownerSpotifyId) return 'review';
  if (!own.artistIds.includes(ownerSpotifyId)) return 'review';

  const key = (c: PublicationCandidate, ids: string[]) =>
    `${norm(c.title)}|${[...ids].sort().join(',')}|${day(c.releaseDate)}`;
  const mine = key(candidate, own.artistIds);
  const duplicate = allReleases.some(other => {
    if (other.id === candidate.id) return false;
    const meta = parse(other.metadata);
    return (
      meta.spotifyId !== own.spotifyId && key(other, meta.artistIds) === mine
    );
  });
  return duplicate ? 'review' : 'publish';
}
