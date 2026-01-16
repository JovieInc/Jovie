/**
 * ISRC Aggregator
 *
 * Aggregates ISRC match results to identify artist-level matches.
 * When multiple tracks from the same DSP artist match our local tracks,
 * this aggregator groups them to create artist match candidates.
 */

import type {
  ArtistMatchCandidate,
  DspProviderId,
  IsrcMatchResult,
} from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Internal structure for tracking artist matches during aggregation
 */
interface ArtistAggregation {
  externalArtistId: string;
  externalArtistName: string;
  externalArtistUrl?: string;
  externalArtistImageUrl?: string;
  matchingIsrcs: Set<string>;
  matchingUpcs: Set<string>;
  tracksChecked: Set<string>;
}

// ============================================================================
// Aggregation Functions
// ============================================================================

/**
 * Aggregate ISRC match results by external artist.
 *
 * Takes a list of individual track matches and groups them by
 * the external artist ID, counting unique ISRCs matched.
 *
 * @param providerId - The DSP provider ID
 * @param matches - Individual ISRC match results
 * @returns Array of artist match candidates, sorted by match count
 */
export function aggregateIsrcMatches(
  providerId: DspProviderId,
  matches: IsrcMatchResult[]
): ArtistMatchCandidate[] {
  // Group matches by external artist ID
  const artistMap = new Map<string, ArtistAggregation>();

  for (const match of matches) {
    const artistId = match.matchedTrack.artistId;

    let aggregation = artistMap.get(artistId);
    if (!aggregation) {
      aggregation = {
        externalArtistId: artistId,
        externalArtistName: match.matchedTrack.artistName,
        matchingIsrcs: new Set(),
        matchingUpcs: new Set(),
        tracksChecked: new Set(),
      };
      artistMap.set(artistId, aggregation);
    }

    // Add the ISRC to the set (deduplicates automatically)
    aggregation.matchingIsrcs.add(match.isrc.toUpperCase());
    aggregation.tracksChecked.add(match.localTrackId);
  }

  // Convert aggregations to candidates
  const candidates: ArtistMatchCandidate[] = [];

  for (const aggregation of artistMap.values()) {
    candidates.push({
      providerId,
      externalArtistId: aggregation.externalArtistId,
      externalArtistName: aggregation.externalArtistName,
      externalArtistUrl: aggregation.externalArtistUrl,
      externalArtistImageUrl: aggregation.externalArtistImageUrl,
      matchingIsrcs: Array.from(aggregation.matchingIsrcs),
      matchingUpcs: Array.from(aggregation.matchingUpcs),
      totalTracksChecked: aggregation.tracksChecked.size,
    });
  }

  // Sort by number of matching ISRCs (descending)
  candidates.sort((a, b) => b.matchingIsrcs.length - a.matchingIsrcs.length);

  return candidates;
}

/**
 * Merge UPC matches into existing artist candidates.
 *
 * If we have UPC (album-level) matches, merge them into the
 * artist candidates to strengthen the match.
 *
 * @param candidates - Existing artist match candidates
 * @param upcMatches - Map of UPC to external artist ID
 * @returns Updated candidates with UPC data merged
 */
export function mergeUpcMatches(
  candidates: ArtistMatchCandidate[],
  upcMatches: Map<string, { artistId: string; upc: string }>
): ArtistMatchCandidate[] {
  // Create a lookup map for existing candidates
  const candidateMap = new Map<string, ArtistMatchCandidate>();
  for (const candidate of candidates) {
    candidateMap.set(candidate.externalArtistId, candidate);
  }

  // Merge UPC matches
  for (const [upc, match] of upcMatches) {
    const candidate = candidateMap.get(match.artistId);
    if (candidate) {
      // Add UPC to existing candidate
      if (!candidate.matchingUpcs.includes(upc)) {
        candidate.matchingUpcs.push(upc);
      }
    }
    // Note: We don't create new candidates from UPC matches alone
    // UPCs strengthen existing ISRC-based candidates
  }

  return candidates;
}

/**
 * Enrich candidates with artist profile data.
 *
 * After initial aggregation, we may want to fetch additional
 * artist data (images, URLs) from the DSP API.
 *
 * @param candidates - Artist match candidates
 * @param artistData - Map of artist ID to profile data
 * @returns Candidates with profile data added
 */
export function enrichCandidatesWithProfiles(
  candidates: ArtistMatchCandidate[],
  artistData: Map<string, { url?: string; imageUrl?: string; name?: string }>
): ArtistMatchCandidate[] {
  return candidates.map(candidate => {
    const profile = artistData.get(candidate.externalArtistId);
    if (profile) {
      return {
        ...candidate,
        externalArtistUrl: profile.url ?? candidate.externalArtistUrl,
        externalArtistImageUrl:
          profile.imageUrl ?? candidate.externalArtistImageUrl,
        // Use profile name if available (may be more accurate)
        externalArtistName: profile.name ?? candidate.externalArtistName,
      };
    }
    return candidate;
  });
}

/**
 * Filter candidates by minimum match count.
 *
 * Removes candidates with too few matches to be considered reliable.
 *
 * @param candidates - Artist match candidates
 * @param minIsrcMatches - Minimum number of ISRC matches required
 * @returns Filtered candidates
 */
export function filterByMinMatches(
  candidates: ArtistMatchCandidate[],
  minIsrcMatches = 1
): ArtistMatchCandidate[] {
  return candidates.filter(
    candidate => candidate.matchingIsrcs.length >= minIsrcMatches
  );
}

/**
 * Get the best candidate from a list of matches.
 *
 * Returns the candidate with the most ISRC matches, or null if empty.
 *
 * @param candidates - Artist match candidates
 * @returns Best candidate or null
 */
export function getBestCandidate(
  candidates: ArtistMatchCandidate[]
): ArtistMatchCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  // Already sorted by ISRC count in aggregateIsrcMatches
  return candidates[0];
}
