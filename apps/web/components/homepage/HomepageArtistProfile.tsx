// @coverage-via apps/web/tests/unit/home/homepage-contract.test.tsx
import Link from 'next/link';
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import { ArtistProfileSectionShell } from '@/components/marketing/artist-profile/ArtistProfileSectionShell';
import { MarketingHero } from '@/components/marketing/MarketingHero';
import { MarketingOfferSummary } from '@/components/marketing/MarketingOfferSummary';
import { MarketingPhoneImage } from '@/components/marketing/MarketingPhoneImage';
import { MarketingPhoneStateGallery } from '@/components/marketing/MarketingPhoneStateGallery';
import { HOMEPAGE_COPY, type HomepageCopy } from '@/data/homepageCopy';
import {
  HOMEPAGE_FAN_STATES_COPY,
  type HomepageFanStatesCopy,
} from '@/data/homepageFanStatesCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import './HomepageArtistProfile.css';

const OWNER = 'apps/web/components/homepage/HomepageArtistProfile.tsx';

/**
 * Hero: the claim action and the product itself. The live profile capture is
 * the page's one hero-weight proof element and its LCP image.
 */
export function HomepageArtistHero({
  copy = HOMEPAGE_COPY.hero,
  headingId = 'homepage-hero-heading',
}: Readonly<{ copy?: HomepageCopy['hero']; headingId?: string }>) {
  return (
    <MarketingHero
      variant='unstyled'
      className='homepage-artist-hero'
      headingId={headingId}
      testId='marketing-section-hero'
      sectionVariant='split-claim-card'
      sectionOwner={OWNER}
    >
      <div className='ap-section-container homepage-artist-hero__inner'>
        <div className='homepage-artist-hero__copy'>
          <h1
            id={headingId}
            className='marketing-type-display text-balance text-primary-token homepage-artist-hero__headline'
          >
            {copy.headline}
          </h1>
          <p className='marketing-type-lede text-secondary-token homepage-artist-hero__subhead'>
            {copy.subhead}
          </p>
          <div
            className='homepage-artist-hero__claim'
            data-testid='homepage-hero-claim'
          >
            <ProductClaimHandleForm
              domain={copy.claim.domain}
              placeholder={copy.claim.placeholder}
              submitLabel={copy.claim.action}
              inputId='homepage-claim-handle'
              testIdPrefix='homepage'
              submitTestId='homepage-primary-cta'
            />
            <p className='homepage-artist-hero__support'>{copy.supportNote}</p>
          </div>
        </div>
        <div className='homepage-artist-hero__media'>
          <ArtistProfilePhoneFrame className='homepage-artist-hero__phone'>
            <MarketingPhoneImage
              scenarioId={copy.profile.scenarioId}
              altOverride={copy.profile.alt}
              fill
              priority
              sizes='(min-width: 1024px) 21.25rem, (min-width: 768px) 18rem, 72vw'
              className='object-cover object-top'
            />
          </ArtistProfilePhoneFrame>
        </div>
      </div>
    </MarketingHero>
  );
}

/** Product gallery: three real profile states, one fan moment each. */
export function HomepageFanStates({
  copy = HOMEPAGE_FAN_STATES_COPY,
}: Readonly<{ copy?: HomepageFanStatesCopy }>) {
  return (
    <ArtistProfileSectionShell
      className='homepage-artist-section'
      sectionId='product-gallery'
      sectionVariant='profile-grid'
      sectionOwner={OWNER}
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.productGallery}
    >
      <h2
        id='homepage-fan-states-heading'
        className='marketing-type-section text-balance text-primary-token homepage-artist-section__headline'
      >
        {copy.headline}
      </h2>
      <MarketingPhoneStateGallery
        states={copy.states}
        label={copy.galleryLabel}
        className='homepage-fan-states__gallery'
        testId='homepage-fan-states'
      />
    </ArtistProfileSectionShell>
  );
}

/** Terminal CTA: the free offer from offer truth, then the same claim. */
export function HomepageOfferClose({
  offer = HOMEPAGE_COPY.offer,
  close = HOMEPAGE_COPY.close,
  claim = HOMEPAGE_COPY.hero.claim,
}: Readonly<{
  offer?: HomepageCopy['offer'];
  close?: HomepageCopy['close'];
  claim?: HomepageCopy['hero']['claim'];
}>) {
  return (
    <ArtistProfileSectionShell
      className='homepage-artist-section'
      containerClassName='homepage-offer-close__grid'
      sectionId='cta'
      sectionVariant='final-single-claim'
      sectionOwner={OWNER}
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.cta}
    >
      <div className='homepage-offer-close__copy'>
        <h2
          id='homepage-offer-heading'
          className='marketing-type-section text-balance text-primary-token homepage-artist-section__headline'
        >
          {offer.headline}
        </h2>
        <p className='marketing-type-lede text-secondary-token homepage-offer-close__subhead'>
          {close.subhead}
        </p>
        <div
          className='homepage-offer-close__claim'
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
        <Link
          href={offer.plansLink.href}
          className='homepage-offer-close__plans focus-ring-themed'
        >
          {offer.plansLink.label}
        </Link>
      </div>
      <MarketingOfferSummary
        plan={offer.plan}
        includedLabel={offer.includedLabel}
        included={offer.included}
        showTerms={false}
        className='homepage-offer-close__summary'
        testId='homepage-offer-summary'
      />
    </ArtistProfileSectionShell>
  );
}
