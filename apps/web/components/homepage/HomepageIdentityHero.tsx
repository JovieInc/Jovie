// @coverage-via apps/web/tests/unit/home/HomepageIdentityHero.test.tsx

import Image from 'next/image';
import {
  HOMEPAGE_CERTIFIED_CONTEXT,
  HOMEPAGE_CERTIFIED_EVENTS,
} from '@/data/homepageCertifiedOptimization';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { HomepageCertifiedExposure } from './HomepageCertifiedExposure';
import { HomepagePrimaryAction } from './HomepagePrimaryAction';
import { HomepageProfileSpecimen } from './HomepageProfileSpecimen';
import './HomepageIdentity.css';

export type HomepageIdentityHeroCopy = typeof HOMEPAGE_IDENTITY_COPY.hero;

export interface HomepageIdentityHeroProps {
  readonly copy?: HomepageIdentityHeroCopy;
  readonly headingId?: string;
}

/**
 * The blue technical texture belongs to the hero only. No other homepage
 * section may reuse it (each background image appears once per page).
 */
export const HOMEPAGE_HERO_TEXTURE = {
  src: '/assets/generated/homepage-hero-technical-texture-v1.webp',
  width: 1672,
  height: 941,
} as const;

/**
 * Canonical Pen homepage hero (2026-09-26): the blue technical texture docked
 * under the header, one headline, one support line, the one Request access
 * action (name search while the waitlist is off), and an illustrative Jovie
 * profile specimen. The texture drifts once per 20s cycle in CSS only; copy
 * and controls never move.
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
        className='homepage-identity-hero__texture'
        aria-hidden='true'
        data-hero-layer='decorative'
        data-hero-visual='technical-texture'
        data-background-image={HOMEPAGE_HERO_TEXTURE.src}
        data-testid='homepage-identity-hero-texture'
      >
        <Image
          alt=''
          className='homepage-identity-hero__texture-image'
          fill
          priority
          sizes='100vw'
          src={HOMEPAGE_HERO_TEXTURE.src}
        />
      </div>
      <div className='homepage-identity-hero__inner' data-hero-layer='active'>
        <span className='homepage-identity-hero__eyebrow'>{copy.eyebrow}</span>
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
        <HomepageProfileSpecimen specimen={copy.specimen} />
      </div>
    </section>
  );
}
