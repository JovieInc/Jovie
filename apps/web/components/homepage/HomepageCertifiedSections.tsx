// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
import Image from 'next/image';
import type { ReactNode } from 'react';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import type { MarketingExportImage } from '@/lib/screenshots/registry';

export type HomepageCertifiedSectionId =
  (typeof HOMEPAGE_LAUNCH_COPY.certified.sections)[number]['id'];

export interface HomepageCertifiedPreviews {
  /** Real public-profile export shown beside "Everything about you, connected." */
  readonly connected: MarketingExportImage;
  /** Real public-profile exports shown beside "Turn attention into relationships." */
  readonly relationships: readonly MarketingExportImage[];
}

export interface HomepageCertifiedSectionsProps {
  readonly previews: HomepageCertifiedPreviews;
}

const PHONE_SIZES = '(min-width: 1024px) 15rem, (min-width: 768px) 24vw, 62vw';

function ProfilePhone({ image }: { readonly image: MarketingExportImage }) {
  return (
    <ArtistProfilePhoneFrame className='homepage-certified-section__device'>
      <Image
        alt={image.alt}
        className='homepage-certified-section__screen'
        height={image.height}
        loading='lazy'
        quality={85}
        sizes={PHONE_SIZES}
        src={image.publicUrl}
        width={image.width}
      />
    </ArtistProfilePhoneFrame>
  );
}

function sectionMedia(
  id: HomepageCertifiedSectionId,
  previews: HomepageCertifiedPreviews
): ReactNode {
  if (id === 'connected') {
    return (
      <div className='homepage-certified-section__phones' data-count='1'>
        <ProfilePhone image={previews.connected} />
      </div>
    );
  }
  if (id === 'relationships') {
    return (
      <div
        className='homepage-certified-section__phones'
        data-count={String(previews.relationships.length)}
      >
        {previews.relationships.map(image => (
          <ProfilePhone image={image} key={image.publicUrl} />
        ))}
      </div>
    );
  }
  return null;
}

/**
 * Sections 2-8 of the certified homepage. Copy is locked in
 * HOMEPAGE_LAUNCH_COPY.certified; this component only owns rhythm: one quiet
 * proof statement, then six top-ruled editorial sections on the shared
 * content column, alternating sides, with real product exports where they
 * exist and nothing where they do not.
 */
export function HomepageCertifiedSections({
  previews,
}: HomepageCertifiedSectionsProps) {
  const { proof, sections } = HOMEPAGE_LAUNCH_COPY.certified;

  return (
    <>
      <section
        className='homepage-certified-proof'
        data-testid='homepage-proof'
        aria-label='Proof'
      >
        <p className='homepage-certified-proof__statement'>{proof.statement}</p>
      </section>
      {sections.map((section, index) => {
        const headingId = `homepage-section-${section.id}-heading`;
        const media = sectionMedia(section.id, previews);

        return (
          <section
            key={section.id}
            id={section.id}
            className='homepage-certified-section'
            data-testid={`homepage-section-${section.id}`}
            data-align={index % 2 === 0 ? 'start' : 'end'}
            data-media={media ? 'true' : 'false'}
            aria-labelledby={headingId}
          >
            <div className='homepage-certified-section__inner'>
              <div className='homepage-certified-section__copy'>
                <h2
                  id={headingId}
                  className='homepage-certified-section__headline'
                  data-homepage-section-heading
                >
                  {section.headline}
                </h2>
                <p className='homepage-certified-section__body'>
                  {section.body}
                </p>
              </div>
              {media ? (
                <div className='homepage-certified-section__media'>{media}</div>
              ) : null}
            </div>
          </section>
        );
      })}
    </>
  );
}
