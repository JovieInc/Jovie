import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { auditLiveHomepageSource } from '@/data/marketing';
import {
  auditHomepagePublicProof,
  auditHomepageRoleInvariants,
  auditHomepageRootComposition,
  auditHomepageRouteIntegrity,
  auditHomepageShippingLayerClaim,
  HOMEPAGE_ROLE_INVARIANT_ISSUE_ID,
  HOMEPAGE_SHIPPING_LAYERS,
  HOMEPAGE_UNLOCKED_SECTION_MOUNTS,
  presenceOnlyHomepageMountsPass,
  readHomepageUnlockedSectionMounts,
} from '@/lib/homepage-role-invariants';
import {
  HOMEPAGE_ARTIST_STORY_REGRESSION_FIXTURE_TEST_ID,
  HOMEPAGE_ARTIST_STORY_REGRESSION_PAGE_SOURCE,
  HOMEPAGE_ARTIST_STORY_REGRESSION_PROOF_TILES,
  HOMEPAGE_ARTIST_STORY_REGRESSION_REQUIRED_MOUNTS,
  HOMEPAGE_ARTIST_STORY_REGRESSION_SHIPPING_CLAIM,
  HomepageArtistStoryRegressionFixture,
} from '@/lib/homepage-role-invariants-fixture';

const repoRoot = path.resolve(__dirname, '../../../../..');
const liveHomepagePath = path.join(repoRoot, 'apps/web/app/(home)/page.tsx');
const artistProfilesPath = path.join(
  repoRoot,
  'apps/web/components/marketing/artist-profile/ArtistProfileLandingPage.tsx'
);
const artistProfilesSource = readFileSync(artistProfilesPath, 'utf8');
const liveHomepageSource = readFileSync(liveHomepagePath, 'utf8');
const homepageArtistProfilesSource = readFileSync(
  path.join(
    repoRoot,
    'apps/web/components/homepage/HomepageArtistProfiles.tsx'
  ),
  'utf8'
);
const combinedLiveHomepageSource = [
  liveHomepageSource,
  homepageArtistProfilesSource,
].join('\n');

describe('JOV-5386 homepage role and shipping invariants', () => {
  it('keeps the public root page on the approved umbrella composition', () => {
    expect(HOMEPAGE_ROLE_INVARIANT_ISSUE_ID).toBe('JOV-5386');
    expect(readHomepageUnlockedSectionMounts(liveHomepageSource)).toEqual([
      ...HOMEPAGE_UNLOCKED_SECTION_MOUNTS,
    ]);
    expect(auditHomepageRootComposition(liveHomepageSource)).toEqual([]);
    expect(auditLiveHomepageSource(liveHomepageSource)).toEqual([]);
    expect(liveHomepageSource).not.toContain('MarketingShippedSitesShowcase');
    expect(liveHomepageSource).not.toContain('MarketingPlatformSpecBento');
    expect(HOMEPAGE_LAUNCH_COPY.hero.headline).toBe(
      'Control how the world sees you.'
    );
    expect(HOMEPAGE_LAUNCH_COPY.hero.secondaryCta.href).toBe(
      '/artist-profiles'
    );
  });

  it('keeps verified public proof, routes, and System B visual lock on `/`', () => {
    expect(
      auditHomepageRoleInvariants({
        pageSource: liveHomepageSource,
        combinedHomepageSource: combinedLiveHomepageSource,
        proofTiles: [],
        shippingClaim: {
          provenLayer: 'source',
          assertedLayer: 'source',
        },
      })
    ).toEqual([]);
    expect(auditHomepageRouteIntegrity(combinedLiveHomepageSource)).toEqual([]);
    expect(auditHomepagePublicProof([])).toEqual([]);
    expect(liveHomepageSource).not.toContain('m-spec-bento__title--pink');
    expect(liveHomepageSource).not.toContain("data-accent='pink'");
    expect(homepageArtistProfilesSource).toContain('Explore Artist Profiles');
    expect(artistProfilesSource).toContain('MarketingShippedSitesShowcase');
    expect(artistProfilesSource).toContain('MarketingPlatformSpecBento');
  });

  it('rejects the JOV-5333 deliberate-red homepage regression', () => {
    expect(
      presenceOnlyHomepageMountsPass(
        HOMEPAGE_ARTIST_STORY_REGRESSION_PAGE_SOURCE,
        HOMEPAGE_ARTIST_STORY_REGRESSION_REQUIRED_MOUNTS
      )
    ).toBe(true);
    expect(
      presenceOnlyHomepageMountsPass(
        liveHomepageSource,
        HOMEPAGE_ARTIST_STORY_REGRESSION_REQUIRED_MOUNTS
      )
    ).toBe(true);

    const findings = auditHomepageRoleInvariants({
      pageSource: HOMEPAGE_ARTIST_STORY_REGRESSION_PAGE_SOURCE,
      combinedHomepageSource: HOMEPAGE_ARTIST_STORY_REGRESSION_PAGE_SOURCE,
      proofTiles: HOMEPAGE_ARTIST_STORY_REGRESSION_PROOF_TILES,
      shippingClaim: HOMEPAGE_ARTIST_STORY_REGRESSION_SHIPPING_CLAIM,
    });
    const codes = findings.map(finding => finding.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'homepage-unlocked-section-order',
        'homepage-artist-profile-story',
        'homepage-decorative-accent-card',
        'homepage-proof-missing-destination',
        'homepage-duplicate-shipped-profile',
        'homepage-demo-capture-as-shipped-profile',
        'homepage-claimed-destination-not-public',
        'homepage-shipping-layer-overclaim',
      ])
    );
    expect(
      auditLiveHomepageSource(HOMEPAGE_ARTIST_STORY_REGRESSION_PAGE_SOURCE)
    ).not.toEqual([]);
    expect(liveHomepageSource).not.toContain(
      HOMEPAGE_ARTIST_STORY_REGRESSION_FIXTURE_TEST_ID
    );
  });

  it('is a deliberate-red artist-profile story mounted on the umbrella homepage', () => {
    render(<HomepageArtistStoryRegressionFixture />);

    const fixture = screen.getByTestId(
      HOMEPAGE_ARTIST_STORY_REGRESSION_FIXTURE_TEST_ID
    );
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(
      screen.getByRole('heading', { name: 'Live Artist Sites' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'The Artist Platform' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('platform-spec-tile')).toHaveAttribute(
      'data-accent',
      'pink'
    );
    expect(liveHomepageSource).not.toContain(
      'homepage-role-invariants-fixture'
    );
  });

  it('keeps source, CI, exact main, deployment, and public runtime as separate proofs', () => {
    expect(HOMEPAGE_SHIPPING_LAYERS).toEqual([
      'source',
      'ci',
      'exact-main',
      'deployment',
      'public-runtime',
    ]);

    for (const assertedLayer of HOMEPAGE_SHIPPING_LAYERS) {
      if (assertedLayer === 'source') {
        expect(
          auditHomepageShippingLayerClaim({
            provenLayer: 'source',
            assertedLayer,
          })
        ).toEqual([]);
        continue;
      }

      expect(
        auditHomepageShippingLayerClaim({
          provenLayer: 'source',
          assertedLayer,
        }).map(finding => finding.code)
      ).toEqual(['homepage-shipping-layer-overclaim']);
    }

    expect(
      auditHomepageShippingLayerClaim({
        provenLayer: 'ci',
        assertedLayer: 'exact-main',
      }).map(finding => finding.code)
    ).toEqual(['homepage-shipping-layer-overclaim']);
    expect(
      auditHomepageShippingLayerClaim({
        provenLayer: 'exact-main',
        assertedLayer: 'deployment',
      }).map(finding => finding.code)
    ).toEqual(['homepage-shipping-layer-overclaim']);
    expect(
      auditHomepageShippingLayerClaim({
        provenLayer: 'deployment',
        assertedLayer: 'public-runtime',
      }).map(finding => finding.code)
    ).toEqual(['homepage-shipping-layer-overclaim']);
  });
});
