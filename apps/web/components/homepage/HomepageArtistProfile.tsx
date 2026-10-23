// @coverage-via apps/web/tests/unit/home/homepage-contract.test.tsx
import Link from 'next/link';
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import { ArtistProfileSectionShell } from '@/components/marketing/artist-profile/ArtistProfileSectionShell';
import { MarketingOfferSummary } from '@/components/marketing/MarketingOfferSummary';
import { MarketingPhoneStateGallery } from '@/components/marketing/MarketingPhoneStateGallery';
import { HOMEPAGE_COPY, type HomepageCopy } from '@/data/homepageCopy';
import {
  HOMEPAGE_FAN_STATES_COPY,
  type HomepageFanStatesCopy,
} from '@/data/homepageFanStatesCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { HomepageHeroCanvas } from './hero-light/HomepageHeroCanvas';
import './HomepageArtistProfile.css';

const OWNER = 'apps/web/components/homepage/HomepageArtistProfile.tsx';

/**
 * Hero: the claim and the headline share one cinematic field. The decorative
 * light is a CSS poster that may upgrade to WebGL. It takes no flow space.
 */
export function HomepageArtistHero({
  copy = HOMEPAGE_COPY.hero,
  headingId = 'homepage-hero-heading',
}: Readonly<{
  copy?: HomepageCopy['hero'];
  headingId?: string;
}>) {
  return (
    <HomepageHeroCanvas
      headingId={headingId}
      headline={copy.headline}
      subhead={copy.subhead}
      claim={copy.claim}
      supportNote={copy.supportNote}
      profile={copy.profile}
      sectionOwner={OWNER}
    />
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
