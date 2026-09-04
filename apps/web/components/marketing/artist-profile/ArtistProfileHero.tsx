import Image from 'next/image';
import { HomepageElectricSeam } from '@/components/homepage/HomepageElectricSeam';
import { HomepagePosterHero } from '@/components/homepage/HomepagePosterHero';
import { HomepageTrackedLink } from '@/components/homepage/HomepageTrackedLink';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { ArtistProfilePhoneFrame } from './ArtistProfilePhoneFrame';
import './ArtistProfileHero.css';

interface ArtistProfileHeroProps {
  readonly hero: ArtistProfileLandingCopy['hero'];
}

const HERO_PROFILE = getMarketingExportImage('tim-white-profile-live-mobile');

function ArtistProfileHeroMedia() {
  return (
    <div className='ap-hero__product-stage'>
      <div className='ap-hero__stage-grid' aria-hidden='true' />
      <ArtistProfilePhoneFrame className='ap-hero__phone'>
        <Image
          fill
          priority
          src={HERO_PROFILE.publicUrl}
          alt="Tim White's Jovie artist profile leading with his latest release and a Listen action."
          className='object-cover object-top'
          sizes='(min-width: 768px) 19rem, 15rem'
        />
      </ArtistProfilePhoneFrame>
    </div>
  );
}

export function ArtistProfileHero({ hero }: Readonly<ArtistProfileHeroProps>) {
  const claimIntent = getClaimProfileIntent();

  return (
    <div className='ap-hero'>
      <HomepagePosterHero
        headingId='artist-profile-hero-heading'
        headline={hero.headline}
        subtitle={hero.subhead}
        primaryCta={{
          label: hero.ctaLabel,
          href: claimIntent.href,
          eventName: claimIntent.eventName,
          signUp: true,
        }}
        secondaryCta={{
          label: 'See How It Adapts',
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
        media={<ArtistProfileHeroMedia />}
        trackedLinkComponent={HomepageTrackedLink}
      />
    </div>
  );
}
