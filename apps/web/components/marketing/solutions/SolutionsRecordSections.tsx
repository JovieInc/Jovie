import Image from 'next/image';
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import { ArtistProfileSectionShell } from '@/components/marketing/artist-profile/ArtistProfileSectionShell';
import { FaqSection } from '@/components/marketing/FaqSection';
import { HomepageV2FinalCta } from '@/components/marketing/homepage-v2/HomepageV2Ctas';
import { MarketingHero } from '@/components/marketing/MarketingHero';
import { MarketingSurfaceCard } from '@/components/marketing/MarketingSurfaceCard';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import {
  HERO_CODE_BINDING_BY_VARIANT,
  type HeroVariantName,
} from '@/data/marketing/factory/heroDecision';
import type { PageAssetRef } from '@/data/marketing/factory/pageRecord';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

/**
 * Record-driven /solutions sections (JOV-7284). Each wraps the canonical
 * owner for its section (MarketingHero via HERO_CODE_BINDING_BY_VARIANT,
 * the section shell, the terminal CTA, FaqSection) and takes only resolved
 * record copy and media, so factory page records render their own words.
 */

const OWNER =
  'apps/web/components/marketing/solutions/SolutionsRecordSections.tsx';

/** Resolved copy for one section instance: `slot -> text`. */
export type SectionCopy = Readonly<Record<string, string | undefined>>;

function RecordMedia({
  media,
  priority = false,
}: Readonly<{ media: PageAssetRef; priority?: boolean }>) {
  const src =
    media.kind === 'screenshot-registry'
      ? getMarketingExportImage(media.id).publicUrl
      : media.id;
  return (
    <ArtistProfilePhoneFrame>
      <Image
        fill
        priority={priority}
        src={src}
        alt={media.alt}
        className='object-cover object-top'
        sizes='(min-width: 768px) 19rem, 15rem'
      />
    </ArtistProfilePhoneFrame>
  );
}

export function SolutionsRecordHero({
  heroVariant,
  copy,
  media,
}: Readonly<{
  heroVariant: HeroVariantName;
  copy: SectionCopy;
  media?: PageAssetRef;
}>) {
  const sectionVariant = HERO_CODE_BINDING_BY_VARIANT[heroVariant]
    .sectionVariantId as string;
  const claimIntent = getClaimProfileIntent();
  const { claim } = HOMEPAGE_IDENTITY_COPY.hero;
  const aside =
    sectionVariant === 'split-claim-card' ? (
      <MarketingSurfaceCard
        variant='floating'
        glowTone='none'
        testId='solutions-record-claim-card'
        className='product-claim-card w-full max-w-85'
        contentClassName='flex flex-col gap-4 px-5 py-5 sm:px-9 sm:py-10'
      >
        <ProductClaimHandleForm
          domain={claim.domain}
          placeholder={claim.placeholder}
          submitLabel={copy.cta ?? claimIntent.label}
          inputId='solutions-record-claim-handle'
          testIdPrefix='solutions-record'
          submitTestId='solutions-record-primary-cta'
        />
      </MarketingSurfaceCard>
    ) : media && sectionVariant === 'split-screenshot-right' ? (
      <RecordMedia media={media} priority />
    ) : null;

  return (
    <MarketingHero
      variant={aside ? 'split' : 'left'}
      headingId='solutions-record-hero-heading'
      testId='marketing-section-hero'
      sectionVariant={sectionVariant}
      sectionOwner={OWNER}
    >
      <div className='max-w-xl'>
        <h1
          id='solutions-record-hero-heading'
          data-wrap='editorial-title'
          className='marketing-hero-headline'
        >
          {copy.headline}
        </h1>
        <p className='marketing-hero-subtitle'>{copy.subhead}</p>
      </div>
      {aside}
    </MarketingHero>
  );
}

export function SolutionsRecordFeatureSplit({
  instanceId,
  copy,
  media,
}: Readonly<{ instanceId: string; copy: SectionCopy; media?: PageAssetRef }>) {
  return (
    <ArtistProfileSectionShell
      id={instanceId}
      sectionId='feature-split'
      sectionVariant={media ? 'phone-right' : 'editorial'}
      sectionOwner={OWNER}
      sectionOccurrence={instanceId}
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.featureSplit}
    >
      <div className='grid items-center gap-12 md:grid-cols-2'>
        <div className='max-w-xl'>
          <h2 data-wrap='editorial-title' className='homepage-story-heading'>
            {copy.headline}
          </h2>
          <p className='mt-6 text-lg leading-relaxed text-secondary-token'>
            {copy.body}
          </p>
        </div>
        {media ? <RecordMedia media={media} /> : null}
      </div>
    </ArtistProfileSectionShell>
  );
}

export function SolutionsRecordCta({
  instanceId,
  copy,
}: Readonly<{ instanceId: string; copy: SectionCopy }>) {
  const claimIntent = getClaimProfileIntent();
  return (
    <HomepageV2FinalCta
      headline={copy.headline}
      ctaLabel={copy.cta ?? claimIntent.label}
      ctaHref={claimIntent.href}
      sectionTestId={`solutions-record-cta-${instanceId}`}
      sectionVariant='final-single-claim'
      headingTestId='solutions-record-cta-headline'
      actionTestId='solutions-record-cta-action'
      analyticsEventName={claimIntent.eventName}
      analyticsSource={`solutions-record-${instanceId}`}
    />
  );
}

export function SolutionsRecordFaq({
  heading,
  items,
}: Readonly<{
  heading?: string;
  items: readonly { question: string; answer: string }[];
}>) {
  return (
    <FaqSection
      sectionVariant='objection-handler'
      heading={heading}
      items={items}
    />
  );
}
