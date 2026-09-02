import {
  HOMEPAGE_FORBIDDEN_ARTIST_STORY_TOKENS,
  HOMEPAGE_ROOT_MOUNTS,
  HOMEPAGE_STORY_STACK_MOUNTS,
  HOMEPAGE_UNLOCKED_SECTION_MOUNTS,
  type HomepagePublicProofTile,
  type HomepageShippingLayerClaim,
} from '@/lib/homepage-role-invariants';

export const HOMEPAGE_ARTIST_STORY_REGRESSION_FIXTURE_TEST_ID =
  'homepage-artist-story-regression-fixture';

export const HOMEPAGE_ARTIST_STORY_REGRESSION_FIXTURE_RED_STYLE = {
  outline: '2px solid #ff0000',
} as const;

/**
 * JOV-5333 / PR #16430, plus stale PR #16426, homepage regression shape.
 *
 * Presence-only freeze tests still pass this source because the approved
 * mounts remain. Production `/` must never match it.
 */
export const HOMEPAGE_ARTIST_STORY_REGRESSION_PAGE_SOURCE = `
function HomepageHero() {
  return <MarketingPosterHero />;
}

function HomepageFaq() {
  return <FaqSection />;
}

function HomepageUnlockedSections() {
  return (
    <>
      <HomepageMeetJovie />
      <HomepageArtistProfiles cards={ARTIST_OUTCOME_CARDS} />
      <MarketingShippedSitesShowcase testId='homepage-shipped-sites-showcase' />
      <MarketingPlatformSpecBento
        testId='homepage-platform-spec-bento'
        data-accent='pink'
        className='m-spec-bento__title--pink'
      />
      <HomepageClosedLoop />
      <HomepageFaq />
    </>
  );
}

function HomepageStoryStack() {
  return (
    <div data-testid='homepage-story-stack'>
      <HomepageUnlockedSections />
      <HomepageV2FinalCta />
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <HomepageHero />
      <HomepageStoryStack />
    </>
  );
}
`;

export const HOMEPAGE_ARTIST_STORY_REGRESSION_PROOF_TILES = [
  {
    id: 'live-release',
    name: 'Tim White',
    handle: 'jov.ie/tim',
    href: '/tim',
    scenarioId: 'tim-white-profile-live-mobile',
    label: 'Latest Release',
  },
  {
    id: 'tour',
    name: 'Tim White',
    handle: 'jov.ie/tim',
    href: '/tim',
    scenarioId: 'tim-white-profile-tour-mobile',
    label: 'Nearby Shows',
  },
  {
    id: 'deep-end-release',
    name: 'The Deep End',
    handle: 'Release page',
    scenarioId: 'release-presave-mobile',
    label: 'Presave',
  },
  {
    id: 'broken-public-destination',
    name: 'The Deep End',
    handle: 'Release page',
    href: '/the-deep-end',
    scenarioId: 'release-presave-mobile',
    label: 'Presave',
  },
  {
    id: 'demo-capture',
    name: 'Studio Capture',
    handle: 'demo',
    href: '/demo/showcase/release-presave',
    scenarioId: 'release-presave-mobile',
    label: 'Demo',
  },
] as const satisfies readonly HomepagePublicProofTile[];

export const HOMEPAGE_ARTIST_STORY_REGRESSION_SHIPPING_CLAIM = {
  provenLayer: 'source',
  assertedLayer: 'public-runtime',
} as const satisfies HomepageShippingLayerClaim;

export const HOMEPAGE_ARTIST_STORY_REGRESSION_REQUIRED_MOUNTS = [
  ...HOMEPAGE_ROOT_MOUNTS,
  ...HOMEPAGE_UNLOCKED_SECTION_MOUNTS,
  ...HOMEPAGE_STORY_STACK_MOUNTS,
] as const;

export function HomepageArtistStoryRegressionFixture() {
  return (
    <div
      data-testid={HOMEPAGE_ARTIST_STORY_REGRESSION_FIXTURE_TEST_ID}
      data-homepage-artist-story-regression-fixture=''
      data-deliberate-red=''
      className='m-spec-bento m-shipped-sites'
      style={HOMEPAGE_ARTIST_STORY_REGRESSION_FIXTURE_RED_STYLE}
    >
      <h2>Live Artist Sites</h2>
      <h2>The Artist Platform</h2>
      {HOMEPAGE_FORBIDDEN_ARTIST_STORY_TOKENS.map(token => (
        <p key={token}>{token}</p>
      ))}
      <article
        data-testid='platform-spec-tile'
        data-accent='pink'
        className='rounded-xl border border-subtle bg-surface-1 p-4'
      >
        <h3 className='m-spec-bento__title--pink'>Capture Every Fan</h3>
      </article>
    </div>
  );
}
