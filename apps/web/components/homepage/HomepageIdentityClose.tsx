// @coverage-via apps/web/tests/unit/home/HomepageIdentitySections.test.tsx
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import { MarketingCtaSection } from '@/components/site/MarketingCtaSection';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import './HomepageIdentity.css';

/**
 * Homepage close: one headline and the same jov.ie/you claim as the hero
 * (Tim 2026-09-28: link claim replaces the JOV-5085 name search).
 */
export function HomepageIdentityClose() {
  const { close } = HOMEPAGE_IDENTITY_COPY;
  const { claim } = HOMEPAGE_IDENTITY_COPY.hero;

  return (
    <MarketingCtaSection
      className='homepage-identity-close'
      data-testid='marketing-section-cta'
      data-marketing-variant='editorial-search'
      data-homepage-testid='homepage-close'
      data-marketing-owner='apps/web/components/homepage/HomepageIdentityClose.tsx'
      data-rhythm='close'
      aria-labelledby='homepage-close-heading'
    >
      <div className='homepage-identity-close__inner'>
        <h2
          id='homepage-close-heading'
          className='homepage-identity-close__headline'
          data-homepage-section-heading
        >
          {close.headline}
        </h2>
        <div
          className='homepage-identity-close__actions'
          data-testid='homepage-close-claim'
        >
          <ProductClaimHandleForm
            domain={claim.domain}
            placeholder={claim.placeholder}
            submitLabel={claim.action}
            inputId='homepage-close-claim-handle'
            testIdPrefix='homepage-close'
          />
        </div>
      </div>
    </MarketingCtaSection>
  );
}
