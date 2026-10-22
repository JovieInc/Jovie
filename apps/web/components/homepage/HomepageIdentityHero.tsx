// @coverage-via apps/web/tests/unit/home/HomepageIdentityHero.test.tsx
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import { Logo } from '@/components/atoms/Logo';
import { MarketingHero, MarketingHeroPhoto } from '@/components/marketing';
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
 * Tim's centered entry refinement (2026-10-21). The existing claim form
 * retains its route and state ownership; explanatory copy follows the fold.
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
        variant='centered'
        className='homepage-claim-hero__layout'
        headingId={headingId}
        testId='marketing-section-hero'
        sectionVariant='centered-claim'
        sectionOwner='apps/web/components/homepage/HomepageIdentityHero.tsx'
      >
        <div className='homepage-claim-hero__copy'>
          <Logo variant='word' size='md' />
          <h1 id={headingId} className='marketing-h1-linear text-primary-token'>
            {copy.headline}
          </h1>
        </div>
        <div
          data-testid='homepage-claim-card'
          className='homepage-claim-hero__card w-full'
        >
          <div className='w-full' data-testid='homepage-editorial-hero-search'>
            <ProductClaimHandleForm
              domain={claim.domain}
              placeholder={claim.placeholder}
              submitLabel={claim.action}
              inputId='homepage-claim-handle'
              testIdPrefix='homepage'
              submitTestId='homepage-primary-cta'
            />
          </div>
        </div>
      </MarketingHero>
      <div
        className='homepage-claim-hero__explanation'
        data-testid='homepage-hero-explanation'
      >
        <p className='marketing-lead-linear text-secondary-token'>
          {copy.subhead}
        </p>
        <div data-testid='homepage-hero-identity'>
          <p className='text-sm text-secondary-token'>{preview.label}</p>
          <p className='text-primary-token'>
            {claim.domain}
            {preview.name}
          </p>
          <p className='text-sm text-secondary-token'>{preview.role}</p>
        </div>
      </div>
    </div>
  );
}
