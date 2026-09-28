// @coverage-via apps/web/tests/unit/home/HomepageIdentityHero.test.tsx
import Image from 'next/image';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import {
  HOMEPAGE_CERTIFIED_CONTEXT,
  HOMEPAGE_CERTIFIED_EVENTS,
} from '@/data/homepageCertifiedOptimization';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { HOMEPAGE_MEDIA_MAP } from '@/data/homepageMediaMap';
import { HomepageCertifiedExposure } from './HomepageCertifiedExposure';
import { HomepagePrimaryAction } from './HomepagePrimaryAction';
import './HomepageIdentity.css';

export type HomepageIdentityHeroCopy = typeof HOMEPAGE_IDENTITY_COPY.hero;

export interface HomepageIdentityHeroProps {
  readonly copy?: HomepageIdentityHeroCopy;
  readonly headingId?: string;
}

const HERO_PROOF = HOMEPAGE_MEDIA_MAP.connected.asset;

/**
 * Canonical Pen homepage hero (My0zu, JOV-6914): one Ion light entering from
 * the lower right and fading to the page ground (pure CSS, no image), one
 * headline, one support line, the certified name search (JOV-5085: Search
 * your name, Find me, /start; never Request access), and Tim White's real
 * jov.ie/tim profile as first-party proof (JOV-6946). The header band and centre stay dark for the copy.
 */
export function HomepageIdentityHero({
  copy = HOMEPAGE_IDENTITY_COPY.hero,
  headingId = 'homepage-identity-hero-heading',
}: HomepageIdentityHeroProps) {
  return (
    <section
      className='homepage-identity-hero marketing-hero-dock marketing-hero-dock--inset'
      aria-labelledby={headingId}
      data-testid='marketing-section-hero'
      data-homepage-testid='homepage-hero-shell'
      data-marketing-owner='apps/web/components/homepage/HomepageIdentityHero.tsx'
      data-marketing-variant='centered-none'
    >
      <HomepageCertifiedExposure />
      <div
        className='homepage-identity-hero__light'
        aria-hidden='true'
        data-hero-layer='decorative'
        data-hero-visual='ion-light'
        data-testid='homepage-identity-hero-light'
      />
      <div className='homepage-identity-hero__inner' data-hero-layer='active'>
        <h1 id={headingId} className='homepage-identity-hero__headline'>
          {copy.headline}
        </h1>
        <p className='homepage-identity-hero__support'>{copy.subhead}</p>
        <div
          className='homepage-identity-hero__action'
          data-testid='homepage-editorial-hero-search'
        >
          <HomepagePrimaryAction
            appearance='editorial'
            inputId='homepage-name-search'
            placeholder={copy.search.placeholder}
            submitLabel={copy.search.action}
            submitTestId='homepage-primary-cta'
            submitAnalytics={{
              eventName: HOMEPAGE_CERTIFIED_EVENTS.SEARCH_SUBMITTED,
              properties: {
                ...HOMEPAGE_CERTIFIED_CONTEXT,
                placement: 'hero',
              },
            }}
          />
        </div>
        <figure
          className='homepage-identity-hero__proof'
          data-testid='homepage-hero-real-profile'
        >
          <ArtistProfilePhoneFrame
            className='homepage-identity-hero__device'
            size='md'
          >
            <Image
              alt={copy.proofAlt}
              className='homepage-identity-hero__screen'
              height={HERO_PROOF.height}
              priority
              quality={85}
              sizes='(min-width: 900px) 18rem, 70vw'
              src={HERO_PROOF.publicUrl}
              width={HERO_PROOF.width}
            />
          </ArtistProfilePhoneFrame>
        </figure>
      </div>
    </section>
  );
}
