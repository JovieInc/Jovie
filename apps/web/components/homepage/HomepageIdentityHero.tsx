// @coverage-via apps/web/tests/unit/home/HomepageIdentityHero.test.tsx
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import {
  MarketingHero,
  MarketingHeroPhoto,
  MarketingSurfaceCard,
} from '@/components/marketing';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { HomepageCertifiedExposure } from './HomepageCertifiedExposure';
import './HomepageIdentity.css';

export type HomepageIdentityHeroCopy = typeof HOMEPAGE_IDENTITY_COPY.hero;

export interface HomepageIdentityHeroProps {
  readonly copy?: HomepageIdentityHeroCopy;
  readonly headingId?: string;
}

const HERO_TEXTURE = {
  src: '/assets/generated/homepage-hero-technical-texture-v1.webp',
  width: 1600,
  height: 900,
} as const;

/**
 * Existing split-claim composition, scoped to the artist-profile launch
 * (JOV-7750, 2026-10-16). The identity primitive shows jov.ie/you beside
 * the claim action, without implying that an example person owns the input.
 */
export function HomepageIdentityHero({
  copy = HOMEPAGE_IDENTITY_COPY.hero,
  headingId = 'homepage-identity-hero-heading',
}: HomepageIdentityHeroProps) {
  const { preview, claim } = copy;

  return (
    <div
      className='homepage-claim-hero marketing-hero-dock marketing-hero-dock--inset relative overflow-hidden'
      data-homepage-testid='homepage-hero-shell'
    >
      <HomepageCertifiedExposure />
      <MarketingHeroPhoto {...HERO_TEXTURE} />
      <div
        aria-hidden='true'
        className='marketing-hero-backdrop pointer-events-none absolute inset-0'
      />
      <MarketingHero
        variant='split'
        className='homepage-claim-hero__layout'
        headingId={headingId}
        testId='marketing-section-hero'
        sectionVariant='split-claim-card'
        sectionOwner='apps/web/components/homepage/HomepageIdentityHero.tsx'
      >
        <div className='homepage-claim-hero__copy max-w-xl'>
          <p className='marketing-kicker'>{copy.kicker}</p>
          <h1
            id={headingId}
            className='marketing-h1-linear mt-6 text-primary-token'
          >
            {copy.headline.split(/(?<=\.) /).map(line => (
              <span key={line} className='block'>
                {line}
              </span>
            ))}
          </h1>
          <p className='marketing-lead-linear mt-6 max-w-xl text-secondary-token'>
            {copy.subhead}
          </p>
        </div>
        <MarketingSurfaceCard
          variant='floating'
          glowTone='none'
          testId='homepage-claim-card'
          className='homepage-claim-hero__card product-claim-card w-full max-w-85'
          contentClassName='flex flex-col gap-4 px-5 py-5 sm:gap-5 sm:px-9 sm:py-10'
        >
          <div
            className='flex flex-col gap-4'
            data-testid='homepage-hero-identity'
          >
            <p className='text-sm text-secondary-token'>{preview.label}</p>
            <p className='product-claim-card__path text-primary-token'>
              <span className='text-tertiary-token'>{claim.domain}</span>
              <span>{preview.name}</span>
            </p>
            <p className='text-sm text-secondary-token'>{preview.role}</p>
          </div>
          <div
            // Phones: the claim leads the card so the consent banner never covers it.
            className='order-first w-full sm:order-none'
            data-testid='homepage-editorial-hero-search'
          >
            <ProductClaimHandleForm
              domain={claim.domain}
              placeholder={claim.placeholder}
              submitLabel={claim.action}
              inputId='homepage-claim-handle'
              testIdPrefix='homepage'
              submitTestId='homepage-primary-cta'
            />
          </div>
        </MarketingSurfaceCard>
      </MarketingHero>
    </div>
  );
}
