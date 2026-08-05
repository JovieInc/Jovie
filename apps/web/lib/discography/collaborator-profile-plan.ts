export interface CreditedArtistCandidate {
  readonly artistId: string;
  readonly name: string;
  readonly spotifyId: string;
  readonly imageUrl: string | null;
}

export interface SpotifyArtistProfileData {
  readonly id: string;
  readonly name: string;
  readonly images?: readonly { readonly url: string }[];
  readonly popularity?: number;
  readonly followers?: { readonly total: number };
  readonly genres?: readonly string[];
}

export interface CreditedArtistReconciliationPlanItem {
  readonly candidate: CreditedArtistCandidate;
  readonly spotifyArtist: SpotifyArtistProfileData | undefined;
}

/**
 * Deterministic exact-ID plan for an import run.
 * Repeated release edges collapse by registry ID; same-name IDs stay distinct.
 */
export function buildCreditedArtistReconciliationPlan(
  rows: readonly CreditedArtistCandidate[],
  spotifyArtists: readonly SpotifyArtistProfileData[]
): CreditedArtistReconciliationPlanItem[] {
  const spotifyArtistById = new Map(
    spotifyArtists.map(artist => [artist.id, artist])
  );
  const byArtistId = new Map<string, CreditedArtistCandidate>();

  for (const row of rows) {
    if (!byArtistId.has(row.artistId)) {
      byArtistId.set(row.artistId, row);
    }
  }

  return [...byArtistId.values()].map(candidate => ({
    candidate,
    spotifyArtist: spotifyArtistById.get(candidate.spotifyId),
  }));
}
