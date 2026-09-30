import {
  MarketingHero,
  MarketingHeroPhoto,
  MarketingPageShell,
  MarketingSurfaceCard,
} from '@/components/marketing';
import { MarketingCtaSection } from '@/components/site/MarketingCtaSection';
import { PRODUCT_COPY } from '@/data/productCopy';
import { ProductClaimHandleForm } from './ProductClaimHandleForm';
import './ProductLanding.css';

const PRODUCT_HERO_PHOTO = {
  src: '/images/marketing-hero/product.webp',
  width: 1600,
  height: 901,
} as const;

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
      <div className='product-claim-card__handle-form w-full'>
        <ProductClaimHandleForm
          domain={claimCard.domain}
          placeholder={claimCard.handle}
          submitLabel={claimCard.cta}
        />
      </div>
    </MarketingSurfaceCard>
  );
}

function ProductClose() {
  const { claimCard, close } = PRODUCT_COPY;

  return (
    <MarketingCtaSection
      className='product-close'
      data-testid='product-close'
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

export function ProductLanding() {
  const { hero } = PRODUCT_COPY;

  return (
    <MarketingPageShell className='bg-base text-primary-token'>
      <div className='product-hero marketing-hero-dock marketing-hero-dock--inset relative overflow-hidden'>
        <MarketingHeroPhoto {...PRODUCT_HERO_PHOTO} />
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
      <ProductClose />
    </MarketingPageShell>
  );
}
