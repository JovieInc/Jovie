/**
 * Onboarding Spotify picker match guard (JOV-7823 artist path / JOV-8051).
 *
 * Decides whether a single top hit may be proposed ("Is This You?") or whether
 * the visitor must pick from 3–5 candidates with differentiators. Pure and
 * client-safe — used before draft mint, not as post-connect certification
 * ({@link artist-identity-confidence.ts}).
 */

import type { SpotifyArtistResult } from '@/lib/contracts/api';
import {
  artistNameSimilarity,
  normalizeArtistName,
} from '@/lib/dsp-enrichment/matching/name-similarity';

/** Cap the disambiguation list (Boardy: 3–5). Search hook already uses 5. */
export const ARTIST_PICKER_CANDIDATE_LIMIT = 5;

/** Near-exact name before a solo proposal is allowed. */
export const ARTIST_PICKER_PROPOSAL_NAME_THRESHOLD = 0.92;

/** Name similarity that counts a row as a competing match. */
export const ARTIST_PICKER_COMPETING_NAME_THRESHOLD = 0.8;

/**
 * If a competing exact-ish peer has this many times the top hit's followers,
 * treat the top hit as a lookalike and force the list.
 */
export const ARTIST_PICKER_LOOKALIKE_FOLLOWER_RATIO = 5;

export type ArtistPickerMatchDecision = 'propose' | 'disambiguate' | 'empty';

export interface ArtistPickerCandidateScore {
  readonly artist: SpotifyArtistResult;
  readonly nameScore: number;
  readonly exactName: boolean;
  readonly followers: number;
  /** Quiet row cue: followers and/or exact-name marker. */
  readonly differentiator: string | null;
}

export interface ArtistPickerMatchAssessment {
  readonly decision: ArtistPickerMatchDecision;
  readonly reason:
    | 'no_results'
    | 'strong_unique_match'
    | 'weak_name'
    | 'competing_matches'
    | 'lookalike_dominance'
    | 'rejected_top';
  readonly candidates: readonly ArtistPickerCandidateScore[];
  readonly proposal: SpotifyArtistResult | null;
}

function followersOf(artist: SpotifyArtistResult): number {
  return typeof artist.followers === 'number' &&
    Number.isFinite(artist.followers)
    ? Math.max(0, artist.followers)
    : 0;
}

function formatFollowerCount(count: number): string | null {
  if (count <= 0) return null;
  try {
    return `${new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(count)} followers`;
  } catch {
    return `${count} followers`;
  }
}

/**
 * Row differentiator for the disambiguation list. Followers first; exact-name
 * cue when the query matches. Never surfaces Spotify's opaque popularity score.
 */
export function formatArtistPickerDifferentiator(
  artist: SpotifyArtistResult,
  query: string
): string | null {
  const nameScore = artistNameSimilarity(query, artist.name);
  const exact =
    normalizeArtistName(query).length > 0 &&
    normalizeArtistName(query) === normalizeArtistName(artist.name);
  const followers = formatFollowerCount(followersOf(artist));
  if (exact) {
    return followers ? `Exact name · ${followers}` : 'Exact name';
  }
  if (nameScore >= ARTIST_PICKER_COMPETING_NAME_THRESHOLD && followers) {
    return followers;
  }
  return followers;
}

function scoreCandidate(
  artist: SpotifyArtistResult,
  query: string
): ArtistPickerCandidateScore {
  const nameScore = artistNameSimilarity(query, artist.name);
  const exactName =
    normalizeArtistName(query).length > 0 &&
    normalizeArtistName(query) === normalizeArtistName(artist.name);
  return {
    artist,
    nameScore,
    exactName,
    followers: followersOf(artist),
    differentiator: formatArtistPickerDifferentiator(artist, query),
  };
}

function hasLookalikeDominance(
  top: ArtistPickerCandidateScore,
  peers: readonly ArtistPickerCandidateScore[]
): boolean {
  if (top.followers <= 0) {
    return peers.some(
      peer =>
        peer.artist.id !== top.artist.id &&
        peer.nameScore >= ARTIST_PICKER_COMPETING_NAME_THRESHOLD &&
        peer.followers >= 1_000
    );
  }
  return peers.some(peer => {
    if (peer.artist.id === top.artist.id) return false;
    if (peer.nameScore + 0.02 < top.nameScore) return false;
    return (
      peer.followers >= top.followers * ARTIST_PICKER_LOOKALIKE_FOLLOWER_RATIO
    );
  });
}

function hasCompetingMatches(
  top: ArtistPickerCandidateScore,
  peers: readonly ArtistPickerCandidateScore[]
): boolean {
  const competitors = peers.filter(
    peer =>
      peer.artist.id !== top.artist.id &&
      peer.nameScore >= ARTIST_PICKER_COMPETING_NAME_THRESHOLD
  );
  if (competitors.length === 0) return false;
  // Exact unique top with clear follower lead may still propose.
  if (top.exactName && top.nameScore >= ARTIST_PICKER_PROPOSAL_NAME_THRESHOLD) {
    const strongerPeer = competitors.some(
      peer => peer.followers > top.followers
    );
    return strongerPeer || competitors.length >= 2;
  }
  return true;
}

/**
 * Assess whether the picker may propose `results[0]` or must show the list.
 * `rejectedIds` keeps Not Me / prior corrections from re-proposing the same hit.
 */
export function assessArtistPickerMatch(input: {
  readonly query: string;
  readonly results: readonly SpotifyArtistResult[];
  readonly rejectedIds?: ReadonlySet<string> | readonly string[];
}): ArtistPickerMatchAssessment {
  const query = input.query.trim();
  const limited = input.results.slice(0, ARTIST_PICKER_CANDIDATE_LIMIT);
  const candidates = limited.map(artist => scoreCandidate(artist, query));
  const rejected =
    input.rejectedIds instanceof Set
      ? input.rejectedIds
      : new Set(input.rejectedIds ?? []);

  if (candidates.length === 0 || query.length === 0) {
    return {
      decision: 'empty',
      reason: 'no_results',
      candidates,
      proposal: null,
    };
  }

  const top = candidates[0];
  if (rejected.has(top.artist.id)) {
    return {
      decision: 'disambiguate',
      reason: 'rejected_top',
      candidates,
      proposal: null,
    };
  }

  // Prefer informative reasons when peers exist (lookalike / competing),
  // even if the top name score is also below the solo-proposal bar.
  if (hasLookalikeDominance(top, candidates)) {
    return {
      decision: 'disambiguate',
      reason: 'lookalike_dominance',
      candidates,
      proposal: null,
    };
  }

  if (hasCompetingMatches(top, candidates)) {
    return {
      decision: 'disambiguate',
      reason: 'competing_matches',
      candidates,
      proposal: null,
    };
  }

  if (top.nameScore < ARTIST_PICKER_PROPOSAL_NAME_THRESHOLD) {
    return {
      decision: 'disambiguate',
      reason: 'weak_name',
      candidates,
      proposal: null,
    };
  }

  return {
    decision: 'propose',
    reason: 'strong_unique_match',
    candidates,
    proposal: top.artist,
  };
}

/** True when a solo "Is This You?" proposal is allowed for this result set. */
export function shouldProposeTopArtistMatch(input: {
  readonly query: string;
  readonly results: readonly SpotifyArtistResult[];
  readonly rejectedIds?: ReadonlySet<string> | readonly string[];
}): boolean {
  return assessArtistPickerMatch(input).decision === 'propose';
}
