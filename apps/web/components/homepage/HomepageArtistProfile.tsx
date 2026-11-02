// @coverage-via apps/web/tests/unit/home/homepage-contract.test.tsx
import Link from 'next/link';
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import { ArtistProfileSectionShell } from '@/components/marketing/artist-profile/ArtistProfileSectionShell';
import { MarketingOfferSummary } from '@/components/marketing/MarketingOfferSummary';
import { ProductShot } from '@/components/marketing/ProductShot';
import { HOMEPAGE_COPY, type HomepageCopy } from '@/data/homepageCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { getPublicPriceClaim } from '@/lib/billing/offer-truth';
import { HomepageHeroCanvas } from './hero-light/HomepageHeroCanvas';
import './HomepageArtistProfile.css';
import './HomepageAtmosphere.css';

const OWNER = 'apps/web/components/homepage/HomepageArtistProfile.tsx';

/**
 * The homepage is one argument in five beats (Tim, 2026-11-01): the link,
 * the loop that turns a listen into a subscriber, the list you own, the
 * offer, and the close. Every visual is a registry product shot cropped to
 * one moment (lib/screenshots/product-shots.ts), never a full screen.
 * Copy slots come from the page spec; shots, prices, and inclusions stay in
 * code (`HOMEPAGE_COPY`, offer truth).
 */

/** Hero: the locked headline, the loop in one line, the claim, the link. */
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
      proofShot={HOMEPAGE_COPY.hero.proofShot}
      sectionOwner={OWNER}
      sectionVariant='split-claim-card'
    />
  );
}

/** The conversion loop: open, subscribe, the email on release day. */
export function HomepageLoop({
  headline = HOMEPAGE_COPY.loop.headline,
}: Readonly<{ headline?: string }>) {
  return (
    <ArtistProfileSectionShell
      className='homepage-artist-section'
      sectionId='how-it-works'
      sectionVariant='3-step-media'
      sectionOwner={OWNER}
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.howItWorks}
    >
      <h2
        id='homepage-loop-heading'
        className='marketing-type-section text-balance text-primary-token homepage-artist-section__headline'
      >
        {headline}
      </h2>
      <ol className='homepage-loop__steps' data-testid='homepage-loop-steps'>
        {HOMEPAGE_COPY.loop.steps.map(step => (
          <li key={step.id} className='homepage-loop__step'>
            <div className='homepage-loop__media'>
              <ProductShot
                id={step.shot}
                staged
                sizes='(min-width: 64rem) 22rem, 92vw'
              />
            </div>
            <h3 className='homepage-loop__title text-balance'>{step.title}</h3>
            <p className='homepage-loop__body text-pretty'>{step.body}</p>
          </li>
        ))}
      </ol>
    </ArtistProfileSectionShell>
  );
}

/** Ownership: the subscribers land in your own list. */
export function HomepageOwnership({
  headline = HOMEPAGE_COPY.ownership.headline,
  body = HOMEPAGE_COPY.ownership.body,
}: Readonly<{ headline?: string; body?: string }>) {
  return (
    <ArtistProfileSectionShell
      className='homepage-artist-section'
      containerClassName='homepage-ownership__grid'
      sectionId='feature-split'
      sectionVariant='editorial'
      sectionOwner={OWNER}
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.featureSplit}
    >
      <div className='homepage-ownership__copy'>
        <h2
          id='homepage-ownership-heading'
          className='marketing-type-section text-balance text-primary-token homepage-artist-section__headline'
        >
          {headline}
        </h2>
        <p className='marketing-type-lede text-pretty text-secondary-token homepage-ownership__body'>
          {body}
        </p>
      </div>
      <div className='homepage-ownership__media'>
        <ProductShot
          id={HOMEPAGE_COPY.ownership.shot}
          className='homepage-shot--wide'
          sizes='(min-width: 64rem) 45rem, 92vw'
        />
        <ProductShot
          id={HOMEPAGE_COPY.ownership.phoneShot}
          className='homepage-shot--phone'
          sizes='92vw'
        />
      </div>
    </ArtistProfileSectionShell>
  );
}

/** The offer: free collects, Artist Presence sends. Prices from offer truth. */
export function HomepageOffer({
  headline = HOMEPAGE_COPY.offer.headline,
  plansLinkLabel = HOMEPAGE_COPY.offer.plansLink.label,
}: Readonly<{ headline?: string; plansLinkLabel?: string }>) {
  const { offer } = HOMEPAGE_COPY;
  const plans = [
    {
      plan: offer.plan,
      includedLabel: offer.includedLabel,
      included: offer.included,
    },
    {
      plan: offer.paid.plan,
      includedLabel: offer.paid.includedLabel,
      included: offer.paid.included,
    },
  ] as const;
  return (
    <ArtistProfileSectionShell
      className='homepage-artist-section'
      sectionId='pricing'
      sectionVariant='tier-cards-neutral'
      sectionOwner={OWNER}
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.pricing}
    >
      <div className='homepage-offer__header'>
        <h2
          id='homepage-offer-heading'
          className='marketing-type-section text-balance text-primary-token homepage-artist-section__headline'
        >
          {headline}
        </h2>
        <Link
          href={offer.plansLink.href}
          className='homepage-offer__plans focus-ring-themed'
        >
          {plansLinkLabel}
        </Link>
      </div>
      <div className='homepage-offer__plans-grid'>
        {plans.map(item => (
          <div key={item.plan} className='homepage-offer__plan'>
            <h3 className='homepage-offer__plan-name'>
              {getPublicPriceClaim(item.plan).displayName}
            </h3>
            <MarketingOfferSummary
              plan={item.plan}
              includedLabel={item.includedLabel}
              included={item.included}
              showTerms={false}
              className='homepage-offer__summary'
              testId={`homepage-offer-summary-${item.plan}`}
            />
          </div>
        ))}
      </div>
    </ArtistProfileSectionShell>
  );
}

/** Close: start from your Spotify name, with the same claim as the hero. */
export function HomepageClose({
  headline = HOMEPAGE_COPY.close.headline,
  subhead = HOMEPAGE_COPY.close.subhead,
  claim = HOMEPAGE_COPY.hero.claim,
}: Readonly<{
  headline?: string;
  subhead?: string;
  claim?: HomepageCopy['hero']['claim'];
}>) {
  return (
    <ArtistProfileSectionShell
      className='homepage-artist-section'
      containerClassName='homepage-close__grid'
      sectionId='cta'
      sectionVariant='final-single-claim'
      sectionOwner={OWNER}
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.cta}
    >
      <div className='homepage-close__copy'>
        <h2
          id='homepage-close-heading'
          className='marketing-type-section text-balance text-primary-token homepage-artist-section__headline'
        >
          {headline}
        </h2>
        <p className='marketing-type-lede text-pretty text-secondary-token homepage-close__subhead'>
          {subhead}
        </p>
        <div
          className='homepage-close__claim'
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
      <div className='homepage-close__media'>
        <ProductShot
          id={HOMEPAGE_COPY.close.shot}
          className='homepage-shot--wide'
          sizes='(min-width: 64rem) 30rem, 92vw'
        />
        <ProductShot
          id={HOMEPAGE_COPY.close.phoneShot}
          className='homepage-shot--phone'
          sizes='92vw'
        />
      </div>
    </ArtistProfileSectionShell>
  );
}
