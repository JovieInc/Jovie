import { HomepageElectricSeam } from '@/components/homepage/HomepageElectricSeam';
import { HomepagePosterHero } from '@/components/homepage/HomepagePosterHero';
import { HomepageTrackedLink } from '@/components/homepage/HomepageTrackedLink';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';
import './ArtistProfileHero.css';

interface ArtistProfileHeroProps {
  readonly hero: ArtistProfileLandingCopy['hero'];
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
}

function ArtistProfileHeroMedia({
  adaptive,
}: Readonly<{ adaptive: ArtistProfileLandingCopy['adaptive'] }>) {
  return (
    <div
      className='ap-hero__product-stage'
      data-testid='artist-profile-hero-product'
    >
      <div className='ap-hero__stage-grid' aria-hidden='true' />
      <div
        id='adaptive'
        className='ap-hero__mode-switcher'
        data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.adaptive}
      >
        <ArtistProfileModeSwitcher
          adaptive={adaptive}
          showIntroHeading={false}
          phoneCaption={adaptive.modes[0]?.headline}
        />
      </div>
    </div>
  );
}

export function ArtistProfileHero({
  hero,
  adaptive,
}: Readonly<ArtistProfileHeroProps>) {
  const claimIntent = getClaimProfileIntent();

  return (
    <div className='ap-hero ap-hero--split'>
      <HomepagePosterHero
        headingId='artist-profile-hero-heading'
        sectionVariant='left-phone'
        sectionOwner='apps/web/components/marketing/MarketingPosterHero.tsx'
        headline={hero.headline}
        subtitle={hero.subhead}
        primaryCta={{
          label: hero.ctaLabel,
          href: claimIntent.href,
          eventName: claimIntent.eventName,
          signUp: true,
        }}
        secondaryCta={{
          label: hero.secondaryCtaLabel,
          href: '#adaptive',
          eventName: 'artist_profiles_adaptive_cta_clicked',
          eventProperties: { source: 'artist-profiles-hero' },
        }}
        seam={
          <HomepageElectricSeam
            idSeed='artist-profile-hero-electric-seam'
            className='homepage-poster-hero__electric-seam'
          />
        }
        media={<ArtistProfileHeroMedia adaptive={adaptive} />}
        trackedLinkComponent={HomepageTrackedLink}
      />
    </div>
  );
}
