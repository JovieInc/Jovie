import { HomepageHeroCanvas } from '@/components/homepage/hero-light/HomepageHeroCanvas';
import { MarketingPageShell } from '@/components/marketing';
import { ConnectedComponentsGallery } from '@/components/marketing/ConnectedComponentsGallery';
import { MarketingCtaSection } from '@/components/site/MarketingCtaSection';
import { PRODUCT_COPY } from '@/data/productCopy';
import { ProductClaimHandleForm } from './ProductClaimHandleForm';
import { ProductExploreLinks } from './ProductExploreLinks';
import './ProductLanding.css';

function ProductClose() {
  const { claimCard, close } = PRODUCT_COPY;

  return (
    <MarketingCtaSection
      className='product-close'
      data-testid='marketing-section-cta'
      data-marketing-variant='editorial-search'
      data-marketing-owner='apps/web/app/(marketing)/product/ProductLanding.tsx'
      aria-labelledby='product-close-heading'
    >
      {/* ui-casing-allow: marketing display headline */}
      <h2
        id='product-close-heading'
        className='product-close__headline text-primary-token'
        data-wrap='editorial-title'
      >
        {close.headlineLine1} <br />
        {close.headlineLine2}
      </h2>
      <div className='product-close__actions' data-testid='product-close-claim'>
        <ProductClaimHandleForm
          domain={claimCard.domain}
          placeholder={claimCard.handle}
          submitLabel={claimCard.cta}
          inputId='product-close-claim-handle'
          testIdPrefix='product-close'
        />
      </div>
    </MarketingCtaSection>
  );
}

/**
 * Product pages use the shader treatment: the same locked-light field and
 * scroll-linked card the shared hero canvas ships. The cinematic treatment
 * belongs to the company homepage; both read one design system.
 */
export function ProductLanding() {
  const { hero, claimCard } = PRODUCT_COPY;

  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <HomepageHeroCanvas
        headingId='product-hero-heading'
        headingTestId='product-hero-heading'
        headline={hero.headline}
        subhead={hero.support}
        claim={{
          domain: claimCard.domain,
          placeholder: claimCard.handle,
          action: claimCard.cta,
        }}
        supportNote={claimCard.proof}
        profile={hero.profile}
        sectionOwner='apps/web/app/(marketing)/product/ProductLanding.tsx'
        sectionVariant='split-claim-card'
        claimTestId='product-claim-card'
        claimInputId='product-handle-input'
        claimTestIdPrefix='product'
        claimSubmitTestId='product-claim-cta'
      />
      <ConnectedComponentsGallery />
      <ProductExploreLinks />
      <ProductClose />
    </MarketingPageShell>
  );
}
