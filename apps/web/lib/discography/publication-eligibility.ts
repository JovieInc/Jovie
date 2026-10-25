/**
 * Publication eligibility for ingested releases that have no approval row.
 *
 * - publish (high confidence): provider-verified identity (provider album id,
 *   owner is a credited album artist by provider id) and not an ambiguous
 *   duplicate. Shown publicly.
 * - review (unsure): everything else. NOT published; shown in the dashboard
 *   release list as an "Is this you?" row the artist accepts or rejects.
 * Artist decisions are never touched: releases that already have an approval
 * row (including hidden/archived) or an identity decision are not candidates.
 */

export interface PublicationCandidate {
  readonly id: string;
  readonly title: string;
  readonly releaseDate: Date | null;
  readonly metadata: unknown;
}

export type PublicationDecision = 'publish' | 'review';

/** Why the importer is (not) confident. Stored with the artist's decision. */
export type PublicationReason =
  | 'verified'
  | 'no_provider_id'
  | 'owner_not_credited'
  | 'duplicate_candidate';

export interface PublicationClassification {
  readonly decision: PublicationDecision;
  readonly reason: PublicationReason;
}

function parse(metadata: unknown): {
  spotifyId: string | null;
  artistIds: string[];
  artistNames: string[];
} {
  const record =
    metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>)
      : {};
  const artists = Array.isArray(record.spotifyArtists)
    ? record.spotifyArtists
    : [];
  const entries = artists.filter(
    (a): a is { id?: unknown; name?: unknown } => !!a && typeof a === 'object'
  );
  return {
    spotifyId:
      typeof record.spotifyId === 'string' && record.spotifyId.trim() !== ''
        ? record.spotifyId
        : null,
    artistIds: entries
      .map(a => a.id)
      .filter((id): id is string => typeof id === 'string' && id !== ''),
    artistNames: entries
      .map(a => a.name)
      .filter((n): n is string => typeof n === 'string' && n !== ''),
  };
}

const norm = (value: string) =>
  value
    .normalize('NFKD')
    .replaceAll(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

export function classifyPublication(
  candidate: PublicationCandidate,
  allReleases: readonly PublicationCandidate[],
  ownerSpotifyId: string | null
): PublicationClassification {
  const own = parse(candidate.metadata);
  if (!own.spotifyId || !ownerSpotifyId) {
    return { decision: 'review', reason: 'no_provider_id' };
  }
  if (!own.artistIds.includes(ownerSpotifyId)) {
    return { decision: 'review', reason: 'owner_not_credited' };
  }

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
  return duplicate
    ? { decision: 'review', reason: 'duplicate_candidate' }
    : { decision: 'publish', reason: 'verified' };
}

export function classifyForPublication(
  candidate: PublicationCandidate,
  allReleases: readonly PublicationCandidate[],
  ownerSpotifyId: string | null
): PublicationDecision {
  return classifyPublication(candidate, allReleases, ownerSpotifyId).decision;
}

/** Provider album id a candidate was imported from, if any. */
export function providerAlbumIdOf(metadata: unknown): string | null {
  return parse(metadata).spotifyId;
}

/** One-line provenance shown on the "Is this you?" row. */
export function describeProvenance(
  candidate: PublicationCandidate,
  reason: PublicationReason
): string {
  const meta = parse(candidate.metadata);
  const year = candidate.releaseDate
    ? String(candidate.releaseDate.getUTCFullYear())
    : null;
  const found = meta.spotifyId ? 'Found on Spotify' : 'Found in your catalog';
  const names = meta.artistNames.join(' & ');
  const why: Record<PublicationReason, string> = {
    verified: '',
    no_provider_id: "We couldn't match this to a Spotify release",
    owner_not_credited: names
      ? `Credited to ${names}, and we can't confirm that's you`
      : "We can't confirm who this is credited to",
    duplicate_candidate: 'Looks like a version of a release you already have',
  };
  return [found, year, why[reason] || null].filter(Boolean).join(' · ');
}

export interface DecisionRate {
  readonly reason: string;
  readonly accepted: number;
  readonly rejected: number;
}

/**
 * Tune the confidence bar from measured outcomes: a reason whose artists
 * accept (nearly) every prompt is safe to promote to auto-publish; one that is
 * rejected often must stay a prompt. Needs a minimum sample before any change.
 */
export function suggestAutoPublishReasons(
  rates: readonly DecisionRate[],
  options: { minDecisions: number; maxRejectRate: number }
): string[] {
  return rates
    .filter(r => {
      const total = r.accepted + r.rejected;
      return (
        total >= options.minDecisions &&
        r.rejected / total <= options.maxRejectRate
      );
    })
    .map(r => r.reason);
}
