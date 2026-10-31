/**
 * Production-cert fixture artist selection (JOV-9928).
 *
 * The anonymous /start certification cannot reuse a hardcoded fixture artist:
 * the server's Spotify identity-conflict predicate answers any anonymous
 * first touch with `ownership_conflict:v1` whenever a `creator_profiles` row
 * is bound to the artist's Spotify id (claimed or not), and the dogfood
 * Golden Path journey claims its fixture in production. The cert therefore
 * verifies its artist is unclaimed AT RUN TIME with a read-only probe and
 * falls down a pool; it never loosens the `confirm_artist:` assertion.
 */

export interface ProdcertArtistFixture {
  /** Exact Spotify artist id (`creator_profiles.spotify_id`). */
  readonly spotifyId: string;
  /** Resolved artist display name, asserted on the confirmation surface. */
  readonly name: string;
  /** Canonical open.spotify.com artist URL pasted into /start. */
  readonly url: string;
}

/**
 * Read-only probe mirroring the server's conflict predicate for an anonymous
 * principal: true when a `creator_profiles` row already exists for the
 * Spotify id. The caller owns the connection; this module stays pure so the
 * selection logic is unit-testable against a fake probe.
 */
export type ProdcertIdentityTakenProbe = (
  spotifyId: string
) => Promise<boolean>;

/**
 * Thrown when every candidate fixture is bound in the target database. The
 * cert must block its claim steps with this reason — running anyway would
 * deterministically produce `ownership_conflict:v1`, and skipping the check
 * silently is exactly the failure JOV-9928 fixed.
 */
export class ProdcertFixtureUnavailableError extends Error {
  readonly takenSpotifyIds: readonly string[];

  constructor(takenSpotifyIds: readonly string[]) {
    super(
      `Every prod-cert fixture artist already has a bound creator_profiles row (${takenSpotifyIds.join(', ')}); the run cannot certify an unclaimed fixture`
    );
    this.name = 'ProdcertFixtureUnavailableError';
    this.takenSpotifyIds = takenSpotifyIds;
  }
}

/**
 * Return the first candidate whose Spotify id has no bound `creator_profiles`
 * row, in pool order. Deterministic: the same database state yields the same
 * choice, so a failing run names the same artist as the one it exercised.
 */
export async function selectUnclaimedCertArtist(
  candidates: readonly ProdcertArtistFixture[],
  isIdentityTaken: ProdcertIdentityTakenProbe
): Promise<ProdcertArtistFixture> {
  const taken: string[] = [];
  for (const candidate of candidates) {
    // Fixtures that permanently own a pool artist (returning canary, ...)
    // keep their binding; a claim journey must never pick or release it.
    if (isReservedFixtureArtist(candidate.spotifyId)) continue;
    if (await isIdentityTaken(candidate.spotifyId)) {
      taken.push(candidate.spotifyId);
      continue;
    }
    return candidate;
  }
  throw new ProdcertFixtureUnavailableError(taken);
}

/**
 * The only artists e2e journeys may claim. Never hardcode one of these in a
 * spec: select with `selectUnclaimedCertArtist` at run time and release the
 * binding in teardown (guarded by e2e-shared-identity-fixture-guard.test.ts).
 */
export const SHARED_E2E_ARTIST_POOL: readonly ProdcertArtistFixture[] = [
  {
    spotifyId: '1ZlSI1juLMMN1HU8X7RViN',
    name: 'UNMARKED',
    url: 'https://open.spotify.com/artist/1ZlSI1juLMMN1HU8X7RViN',
  },
  {
  },
  {
    spotifyId: '6TWG4bY1qzp0lJuxxFtl6F',
    name: 'Unmarked Cars',
    url: 'https://open.spotify.com/artist/6TWG4bY1qzp0lJuxxFtl6F',
  },
];

/**
 * Permanently bound to the seeded returning-creator canary
 * (`returning-canary-seed-spec.ts`). Not part of the shared pool: run-time
 * claim journeys never pick it, so its binding is never released or
 * contested.
 */
export const RETURNING_CANARY_RESERVED_ARTIST: ProdcertArtistFixture =
  Object.freeze({
    spotifyId: '6knM2BGm18cXek6FXbWd0t',
    name: 'Good Dropouts',
    url: 'https://open.spotify.com/artist/6knM2BGm18cXek6FXbWd0t',
  });

/**
 * Permanently bound to the admitted production canary
 * (`admitted-canary-fixture.ts`). Never part of the shared pool: run-time
 * claim journeys skip it, so its binding is never released or contested.
 */
export const ADMITTED_CANARY_RESERVED_ARTIST: ProdcertArtistFixture =
  Object.freeze({
    spotifyId: '0T4McYgGzOzXOWzLaukIjD',
    name: 'Unmarked Pavement',
    url: 'https://open.spotify.com/artist/0T4McYgGzOzXOWzLaukIjD',
  });

/** Spotify ids owned by permanent fixtures; selection skips every one. */
export const RESERVED_FIXTURE_ARTIST_IDS: ReadonlySet<string> = new Set([
  RETURNING_CANARY_RESERVED_ARTIST.spotifyId,
  ADMITTED_CANARY_RESERVED_ARTIST.spotifyId,
]);

export function isReservedFixtureArtist(spotifyId: string): boolean {
  return RESERVED_FIXTURE_ARTIST_IDS.has(spotifyId);
}
