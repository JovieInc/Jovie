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

type HomepageSection = (typeof HOMEPAGE_LAUNCH_COPY.certified.sections)[number];

function EditorialSection({
  children,
  dataMedia,
  rhythm,
  section,
}: Readonly<{
  children: ReactNode;
  dataMedia: 'true' | 'false';
  rhythm: 'product' | 'text';
  section: HomepageSection;
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
}: Readonly<{ image: MarketingExportImage; caption: string }>) {
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
      <figcaption className='homepage-next-step__caption'>{caption}</figcaption>
    </figure>
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
          {section.steps.map(step => (
            <ProfileSurface
              caption={step.caption}
              image={previews[step.id]}
              key={step.id}
            />
          ))}
        </div>
      </div>
    </EditorialSection>
  );
}
