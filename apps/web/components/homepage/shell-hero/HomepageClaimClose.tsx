// @coverage-via apps/web/components/homepage/shell-hero/HomepageClaimClose.test.tsx
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import { HOMEPAGE_COPY, type HomepageCopy } from '@/data/homepageCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

/** Terminal CTA: the one real claim form on the page. */
export function HomepageClaimClose({
  copy = HOMEPAGE_COPY.shell.claim,
}: Readonly<{ copy?: HomepageCopy['shell']['claim'] }>) {
  return (
    <section
      id='cta'
      className='shell-section shell-claim'
      aria-labelledby='home-claim-heading'
      data-accent='ion'
      data-testid='marketing-section-cta'
      data-marketing-owner='apps/web/components/homepage/shell-hero/HomepageClaimClose.tsx'
      data-marketing-variant='final-single-claim'
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.cta}
    >
      <MarketingContainer width='page'>
        <div className='shell-claim__inner'>
          <h2
            id='home-claim-heading'
            className='marketing-type-section text-balance text-primary-token'
          >
            {copy.heading}
          </h2>
          <p className='marketing-type-lede text-secondary-token'>
            {copy.subhead}
          </p>
          <div className='shell-claim__form' data-testid='homepage-hero-claim'>
            <ProductClaimHandleForm
              domain={copy.domain}
              placeholder={copy.placeholder}
              submitLabel={copy.action}
              inputId='homepage-claim-handle'
              testIdPrefix='homepage'
              submitTestId='homepage-primary-cta'
            />
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
