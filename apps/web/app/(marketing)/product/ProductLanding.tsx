import { Button } from '@jovie/ui/atoms/button';
import Link from 'next/link';
import { InputAuraFrame } from '@/components/features/home/InputAuraFrame';
import {
  MarketingHero,
  MarketingPageShell,
  MarketingSurfaceCard,
} from '@/components/marketing';
import { PRODUCT_CLAIM_HREF, PRODUCT_COPY } from '@/data/productCopy';
import './ProductLanding.css';

function ProductClaimCard() {
  const { claimCard } = PRODUCT_COPY;

  return (
    <MarketingSurfaceCard
      variant='floating'
      glowTone='none'
      testId='product-claim-card'
      className='product-claim-card w-full max-w-120'
      contentClassName='flex flex-col gap-6 px-8 py-9 sm:px-9 sm:py-10'
    >
      <p className='product-claim-card__status'>{claimCard.status}</p>
      <p className='product-claim-card__path text-primary-token'>
        <span className='text-tertiary-token'>{claimCard.domain}</span>
        <span>{claimCard.handle}</span>
      </p>
      <p className='max-w-sm text-base leading-relaxed text-secondary-token'>
        {claimCard.outcome}
      </p>
      <p className='text-sm text-tertiary-token'>{claimCard.proof}</p>
      <div className='homepage-name-search w-full'>
        <InputAuraFrame treatment='editorial' className='rounded-full'>
          <div className='homepage-name-search__field relative flex w-full items-center'>
            <span className='product-claim-card__field-path min-w-0 flex-1 text-primary-token'>
              <span className='text-tertiary-token'>{claimCard.domain}</span>
              <span>{claimCard.handle}</span>
            </span>
            <Button
              asChild
              size='marketing'
              variant='primary'
              className='shrink-0'
            >
              <Link
                href={PRODUCT_CLAIM_HREF}
                data-testid='product-claim-cta'
                data-primary-action='true'
              >
                {claimCard.cta}
              </Link>
            </Button>
          </div>
        </InputAuraFrame>
      </div>
    </MarketingSurfaceCard>
  );
}

export function ProductLanding() {
  const { hero } = PRODUCT_COPY;

  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <div className='product-hero relative overflow-hidden'>
        <div
          aria-hidden='true'
          className='marketing-hero-backdrop pointer-events-none absolute inset-0'
        />
        <div className='hero-glow product-hero-glow pointer-events-none absolute inset-x-0 top-0' />
        <MarketingHero
          variant='split'
          headingId='product-hero-heading'
          testId='marketing-section-hero'
        >
          <div className='max-w-xl'>
            <p className='marketing-kicker'>{hero.kicker}</p>
            <h1
              id='product-hero-heading'
              data-testid='product-hero-heading'
              className='marketing-h1-linear marketing-h1-max-two-lines line-clamp-2 mt-6 text-primary-token'
            >
              {hero.headline}
            </h1>
            <p className='marketing-lead-linear mt-6 max-w-xl text-secondary-token'>
              {hero.support}
            </p>
          </div>
          <ProductClaimCard />
        </MarketingHero>
      </div>
    </MarketingPageShell>
  );
}
