// @coverage-via apps/web/tests/unit/home/HomepageIdentityHero.test.tsx
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import { Logo } from '@/components/atoms/Logo';
import { MarketingHero } from '@/components/marketing';
import { MarketingAmbientField } from '@/components/marketing/motion/MarketingAmbientField';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { HomepageCertifiedExposure } from './HomepageCertifiedExposure';
import { HomepageLogoStrip } from './HomepageLogoStrip';
import './HomepageIdentity.css';

export type HomepageIdentityHeroCopy = typeof HOMEPAGE_IDENTITY_COPY.hero;

export interface HomepageIdentityHeroProps {
  readonly copy?: HomepageIdentityHeroCopy;
  readonly headingId?: string;
}

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
      className='homepage-claim-hero relative'
      data-homepage-testid='homepage-hero-shell'
    >
      <HomepageCertifiedExposure />
      <div
        className='homepage-claim-hero__scroll-region'
        data-testid='homepage-hero-scroll-region'
      >
        <div className='homepage-claim-hero__frame'>
          <div
            className='homepage-claim-hero__surface'
            data-testid='homepage-hero-surface'
            aria-hidden='true'
          >
            <MarketingAmbientField
              accent='blue'
              variant='refracted'
              motion='intro'
            />
          </div>
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
              <h1
                id={headingId}
                className='marketing-h1-linear text-primary-token'
              >
                {copy.headline}
              </h1>
            </div>
            <div
              data-testid='homepage-claim-card'
              className='homepage-claim-hero__card w-full'
            >
              <div
                className='w-full'
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
            </div>
          </MarketingHero>
        </div>
      </div>
      <HomepageLogoStrip />
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
