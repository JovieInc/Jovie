// @coverage-via apps/web/tests/unit/home/homepage-contract.test.tsx
import Link from 'next/link';
import { WaitlistRoleForm } from '@/components/features/waitlist/WaitlistRoleForm';
import { ArtistProfileSectionShell } from '@/components/marketing/artist-profile/ArtistProfileSectionShell';
import { MarketingOfferSummary } from '@/components/marketing/MarketingOfferSummary';
import { MarketingPhoneImage } from '@/components/marketing/MarketingPhoneImage';
import { ProductShot } from '@/components/marketing/ProductShot';
import { HOMEPAGE_COPY, type HomepageCopy } from '@/data/homepageCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { getPublicPriceClaim } from '@/lib/billing/offer-truth';
import { HomepageNameSearch } from './HomepageNameSearch';
import { HomepageHeroLight } from './hero-light/HomepageHeroLight';
import './HomepageArtistProfile.css';
import './HomepageAtmosphere.css';

const OWNER = 'apps/web/components/homepage/HomepageArtistProfile.tsx';

/** General identity discovery, one public profile, permissioned relationships,
 * and one invitation request. Captures reuse shipped product components. */

/** Hero: the locked headline, the loop in one line, the claim, the link. */
export function HomepageArtistHero({
  copy = HOMEPAGE_COPY.hero,
  headingId = 'homepage-hero-heading',
}: Readonly<{
  copy?: HomepageCopy['hero'];
  headingId?: string;
}>) {
  return (
    <ArtistProfileSectionShell
      className='homepage-discovery-hero'
      containerClassName='homepage-discovery-hero__content'
      sectionId='hero'
      sectionVariant='left-none'
      sectionOwner={OWNER}
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.hero}
    >
      <HomepageHeroLight animate={false} />
      <div className='homepage-discovery-hero__lead'>
        <h1
          id={headingId}
          className='marketing-type-display text-balance text-primary-token'
        >
          {copy.headline}
        </h1>
        <p className='marketing-type-lede text-pretty text-secondary-token homepage-discovery-hero__subhead'>
          {copy.subhead}
        </p>
        <HomepageNameSearch />
        <div className='homepage-discovery-hero__access'>
          <Link
            href={HOMEPAGE_COPY.access.href}
            className='homepage-access-link focus-ring-themed'
          >
            {copy.claim.action}
          </Link>
          <Link
            href={HOMEPAGE_COPY.access.inviteHref}
            className='focus-ring-themed'
          >
            {HOMEPAGE_COPY.access.invite}
          </Link>
        </div>
        <p className='homepage-discovery-hero__note text-secondary-token'>
          {copy.supportNote}
        </p>
      </div>
    </ArtistProfileSectionShell>
  );
}

/** Section two: the existing template profile, cropped to its identity UI. */
export function HomepageLoop({
  headline = HOMEPAGE_COPY.loop.headline,
}: Readonly<{ headline?: string }>) {
  return (
    <ArtistProfileSectionShell
      className='homepage-artist-section'
      containerClassName='homepage-profile__grid'
      sectionId='how-it-works'
      sectionVariant='split-setup'
      sectionOwner={OWNER}
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.howItWorks}
    >
      <div>
        <h2
          id='homepage-loop-heading'
          className='marketing-type-section text-balance text-primary-token homepage-artist-section__headline'
        >
          {headline}
        </h2>
        <p className='marketing-type-lede text-pretty text-secondary-token homepage-ownership__body'>
          {HOMEPAGE_COPY.loop.body}
        </p>
      </div>
      <div
        className='homepage-profile__preview'
        data-testid='homepage-profile-preview'
      >
        <MarketingPhoneImage
          scenarioId={HOMEPAGE_COPY.loop.profileScenario}
          altOverride={HOMEPAGE_COPY.loop.profileAlt}
          sizes='(min-width: 64rem) 25rem, 90vw'
        />
      </div>
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

/** Legacy offer story; plan labels and prices remain owned by offer truth. */
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

/** One role-based waitlist; signup, verification, and submission stay owned
 * by the canonical WaitlistRoleForm dependency. */
export function HomepageClose({
  headline = HOMEPAGE_COPY.close.headline,
  subhead = HOMEPAGE_COPY.close.subhead,
}: Readonly<{
  headline?: string;
  subhead?: string;
  claim?: HomepageCopy['hero']['claim'];
}>) {
  return (
    <ArtistProfileSectionShell
      id='waitlist'
      className='homepage-waitlist'
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
        <Link
          href={HOMEPAGE_COPY.access.inviteHref}
          className='homepage-waitlist__invite focus-ring-themed'
        >
          {HOMEPAGE_COPY.access.invite}
        </Link>
      </div>
      <div className='homepage-waitlist__form'>
        <WaitlistRoleForm variant='general' headingLevel={3} />
      </div>
    </ArtistProfileSectionShell>
  );
}
