/**
 * Deterministic, source-backed fixture for the smart-link screen-certification
 * producer (JOV-7127). It lets `ContentSmartLinkPage` and `TrackDeepLinkPage`
 * — the exact registered sources for `web.smartlink-release` and
 * `web.smartlink-track` — render without a database, so the Product
 * Screenshots workflow can capture exact-head proof against a production
 * build with `DATABASE_URL=postgresql://localhost/noop`.
 *
 * Admission is double-gated. Both must hold before either page reads this
 * fixture instead of the database:
 *  - the username is an exact, permanently reserved handle
 *    (`isReservedPublicProfileIdentity`, reason `screen_cert_fixture`), so no
 *    real creator can ever claim it and collide with this route;
 *  - `isRenderFixtureEnabled()` additionally fails closed on a real
 *    production deployment (`VERCEL_ENV === 'production'`) regardless of the
 *    requested username, so this can never serve real traffic even if the
 *    reservation above were ever removed.
 *
 * Never import this module from a non-fixture code path, and never widen the
 * admission check beyond the exact reserved username.
 */
import type { getContentBySlug, getCreatorByUsername } from './data';

/** Exact reserved handle — see `public-profile-identity-policy.ts`. */
export const SCREEN_CERT_SMARTLINK_USERNAME = 'jovie-screen-fixture';
export const SCREEN_CERT_SMARTLINK_RELEASE_SLUG = 'screen-cert-release';
export const SCREEN_CERT_SMARTLINK_TRACK_SLUG = 'screen-cert-track';

type FixtureCreator = NonNullable<
  Awaited<ReturnType<typeof getCreatorByUsername>>
>;
type FixtureContent = NonNullable<Awaited<ReturnType<typeof getContentBySlug>>>;

export const SCREEN_CERT_SMARTLINK_FIXTURE_CREATOR: FixtureCreator = {
  id: 'screen-cert-fixture-creator',
  userId: null,
  displayName: 'Screen Cert Fixture',
  username: SCREEN_CERT_SMARTLINK_USERNAME,
  usernameNormalized: SCREEN_CERT_SMARTLINK_USERNAME,
  avatarUrl: null,
  settings: null,
  spotifyUrl: null,
  appleMusicUrl: null,
  youtubeUrl: null,
  musicbrainzId: null,
  isClaimed: true,
};

/** Generic, already-shipped placeholder artwork (`DemoReleaseLandingSurface` uses the same asset family). */
const SCREEN_CERT_SMARTLINK_ARTWORK_URL = '/images/demo/artwork-1.png';

export const SCREEN_CERT_SMARTLINK_RELEASE_CONTENT: FixtureContent = {
  type: 'release',
  id: 'screen-cert-fixture-release',
  title: 'Screen Cert Fixture Release',
  slug: SCREEN_CERT_SMARTLINK_RELEASE_SLUG,
  artworkUrl: SCREEN_CERT_SMARTLINK_ARTWORK_URL,
  releaseDate: new Date('2025-01-01T00:00:00.000Z'),
  revealDate: null,
  providerLinks: [
    {
      providerId: 'spotify',
      url: 'https://open.spotify.com/search/Screen%20Cert%20Fixture',
    },
    {
      providerId: 'apple_music',
      url: 'https://music.apple.com/us/search?term=Screen%20Cert%20Fixture',
    },
  ],
  artworkSizes: null,
  metadata: null,
  releaseType: 'single',
  totalTracks: 1,
  previewUrl: null,
  previewMetadata: null,
  releaseId: null,
  releaseSlug: null,
  releaseTitle: null,
  credits: undefined,
  primaryArtists: undefined,
  durationMs: 210_000,
  isrc: null,
  upc: null,
  trackNumber: null,
};

export const SCREEN_CERT_SMARTLINK_TRACK_CONTENT: FixtureContent = {
  ...SCREEN_CERT_SMARTLINK_RELEASE_CONTENT,
  type: 'track',
  id: 'screen-cert-fixture-track',
  title: 'Screen Cert Fixture Track',
  slug: SCREEN_CERT_SMARTLINK_TRACK_SLUG,
  releaseId: SCREEN_CERT_SMARTLINK_RELEASE_CONTENT.id,
  releaseSlug: SCREEN_CERT_SMARTLINK_RELEASE_CONTENT.slug,
  releaseTitle: SCREEN_CERT_SMARTLINK_RELEASE_CONTENT.title,
  trackNumber: 1,
};
