// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
import Image from 'next/image';
import type { ReactNode } from 'react';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import type { MarketingExportImage } from '@/lib/screenshots/registry';

export type HomepageCertifiedSectionId =
  (typeof HOMEPAGE_LAUNCH_COPY.certified.sections)[number]['id'];

/**
 * Real public-profile exports for the approved customer-zero example
 * (jov.ie/tim): the two next steps a visitor can take, updates and payment
 * (JOV-6946 real first-party proof).
 */
export interface HomepageCertifiedPreviews {
  readonly subscribe: MarketingExportImage;
  readonly pay: MarketingExportImage;
}

export interface HomepageCertifiedSectionsProps {
  readonly previews: HomepageCertifiedPreviews;
}

export interface HomepageEditorialFeatureSectionContent {
  readonly id: string;
  readonly headline: string;
  readonly body: string;
}

export interface HomepageEditorialFeaturePreview {
  readonly image: MarketingExportImage;
  /** Omit when the record does not own an editorial caption. */
  readonly caption?: string;
}

export interface HomepageEditorialFeatureSectionProps {
  readonly section: HomepageEditorialFeatureSectionContent;
  /** This source-backed phone row supports one or two real exports. */
  readonly previews: readonly HomepageEditorialFeaturePreview[];
}

function EditorialSection({
  children,
  dataMedia,
  rhythm,
  section,
}: Readonly<{
  children: ReactNode;
  dataMedia: 'true' | 'false';
  rhythm: 'product' | 'text';
  section: HomepageEditorialFeatureSectionContent;
}>) {
  return (
    <section
      id={section.id}
      className={`homepage-certified-section homepage-certified-section--${section.id}`}
      data-testid='marketing-section-feature-split'
      data-homepage-testid={`homepage-section-${section.id}`}
      data-marketing-owner='apps/web/components/homepage/HomepageCertifiedSections.tsx'
      data-marketing-variant='editorial'
      data-marketing-occurrence={section.id}
      data-align='start'
      data-media={dataMedia}
      data-rhythm={rhythm}
      aria-labelledby={`homepage-section-${section.id}-heading`}
    >
      {children}
    </section>
  );
}

function ProfileSurface({
  image,
  caption,
}: Readonly<{ image: MarketingExportImage; caption?: string }>) {
  return (
    <figure className='homepage-next-step'>
      <ArtistProfilePhoneFrame
        className='homepage-certified-section__device'
        size='md'
      >
        <Image
          alt={image.alt}
          className='homepage-certified-section__screen'
          height={image.height}
          loading='lazy'
          quality={85}
          sizes='(min-width: 900px) 18rem, 70vw'
          src={image.publicUrl}
          width={image.width}
        />
      </ArtistProfilePhoneFrame>
      {caption ? (
        <figcaption className='homepage-next-step__caption'>
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * Record-owned editorial split using the certified homepage phone treatment.
 * The caller supplies its own copy and one or two real screenshot exports;
 * this renderer adds no canned copy or borrowed second capture.
 */
export function HomepageEditorialFeatureSection({
  section,
  previews,
}: HomepageEditorialFeatureSectionProps) {
  if (previews.length < 1 || previews.length > 2) {
    throw new Error(
      `Homepage editorial feature ${section.id} requires one or two real previews`
    );
  }

  return (
    <EditorialSection dataMedia='true' rhythm='product' section={section}>
      <div className='homepage-certified-section__inner'>
        <div className='homepage-certified-section__copy'>
          <h2
            id={`homepage-section-${section.id}-heading`}
            className='homepage-certified-section__headline'
            data-homepage-section-heading
          >
            {section.headline}
          </h2>
          <p className='homepage-certified-section__body'>{section.body}</p>
        </div>
        <div className='homepage-next-steps' data-homepage-visual={section.id}>
          {previews.map(preview => (
            <ProfileSurface
              caption={preview.caption}
              image={preview.image}
              key={`${section.id}-${preview.image.publicUrl}`}
            />
          ))}
        </div>
      </div>
    </EditorialSection>
  );
}

/**
 * Pen My0zu (JOV-6946): one section, one job. The hero already shows the
 * profile; this section proves the next steps a visitor takes from it, with
 * real captures of jov.ie/tim. The retired connected chapter, numbered
 * outcomes, visibility block, and lenses slider replayed the hero argument.
 */
export function HomepageCertifiedSections({
  previews,
}: HomepageCertifiedSectionsProps) {
  const section = HOMEPAGE_LAUNCH_COPY.certified.sections[0];

  return (
    <HomepageEditorialFeatureSection
      section={section}
      previews={section.steps.map(step => ({
        caption: step.caption,
        image: previews[step.id],
      }))}
    />
  );
}
