/**
 * Stable fixtures for the live agent-path cert harness.
 *
 * Name search for "Tim White" returns unrelated candidates (e.g. Watt White),
 * while the historical default track URL is a Tim White remix — so pairing
 * those two fails prepare_launch with artist_identity conflicts and missing
 * artwork/date. Use an exact Spotify artist URL plus matching release
 * metadata so launch_draft_ready does not depend on flaky upstream enrichers.
 *
 * Artist is the first SHARED_E2E_ARTIST_POOL entry (UNMARKED): low-reach so a
 * later claim walk (JOV-9760) is not forced into verification_required.
 */
export const CERT_DEFAULT_ARTIST_URL =
  'https://open.spotify.com/artist/1ZlSI1juLMMN1HU8X7RViN';

export const CERT_DEFAULT_ARTIST_NAME = 'UNMARKED';

/** Synthetic but schema-valid release facts that match CERT_DEFAULT_ARTIST_*. */
export const CERT_DEFAULT_RELEASE_METADATA = {
  title: 'Agent Path Cert Fixture',
  artist_name: CERT_DEFAULT_ARTIST_NAME,
  release_date: '2024-01-15',
  artwork_url: 'https://jov.ie/favicon.ico',
  dsp_links: {
    spotify: 'https://open.spotify.com/track/25dMCbj0duxuvx5T8ClCp3',
  },
} as const;

export type CertReleaseMetadata = {
  readonly title?: string;
  readonly artist_name?: string;
  readonly release_date?: string;
  readonly artwork_url?: string;
  readonly upc?: string;
  readonly dsp_links?: Readonly<Record<string, string>>;
};
