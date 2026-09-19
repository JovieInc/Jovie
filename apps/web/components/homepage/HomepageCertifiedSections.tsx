// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
import Image from 'next/image';
import type { ReactNode } from 'react';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import type { MarketingExportImage } from '@/lib/screenshots/registry';

export type HomepageCertifiedSectionId =
  (typeof HOMEPAGE_LAUNCH_COPY.certified.sections)[number]['id'];

/**
 * Kept as a source-compatible input while the homepage transitions away from
 * product screenshots in the locked editorial pass. The approved composition
 * uses the conceptual identity artwork instead of a profile export.
 */
export interface HomepageCertifiedPreviews {
  readonly connected?: MarketingExportImage;
  readonly relationships?: readonly MarketingExportImage[];
}

export interface HomepageCertifiedSectionsProps {
  readonly previews?: HomepageCertifiedPreviews;
}

const IDENTITY_ARTWORK = {
  src: '/assets/generated/homepage-identity-optical-v1.webp',
  width: 1902,
  height: 827,
  alt: 'A conceptual photographic assembly of a profile identity',
} as const;

type HomepageSection = (typeof HOMEPAGE_LAUNCH_COPY.certified.sections)[number];
type RelationshipSection = Extract<HomepageSection, { id: 'relationships' }>;

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

function RelationshipOutcomes({
  outcomes,
}: Readonly<{ outcomes: RelationshipSection['outcomes'] }>) {
  return (
    <ol className='homepage-relationship-outcomes' aria-label='Relationships'>
      {outcomes.map((outcome, index) => (
        <li
          key={outcome.id}
          className='homepage-relationship-outcome'
          data-homepage-testid={`homepage-outcome-${outcome.id}`}
        >
          <span
            className='homepage-relationship-outcome__index'
            aria-hidden='true'
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className='homepage-relationship-outcome__copy'>
            <h3>{outcome.headline}</h3>
            <p>{outcome.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ConnectedSection({
  section,
}: Readonly<{
  section: Extract<HomepageSection, { id: 'connected' }>;
}>) {
  return (
    <EditorialSection dataMedia='true' rhythm='product' section={section}>
      <div className='homepage-certified-section__inner'>
        <div className='homepage-connected-header'>
          <div className='homepage-certified-section__copy'>
            <p className='homepage-certified-section__eyebrow'>
              {section.eyebrow}
            </p>
            <h2
              id='homepage-section-connected-heading'
              className='homepage-certified-section__headline'
              data-homepage-section-heading
            >
              {section.headline}
            </h2>
          </div>
          <p className='homepage-certified-section__body'>{section.body}</p>
        </div>
        <div className='homepage-connected-artwork'>
          <Image
            alt={IDENTITY_ARTWORK.alt}
            className='homepage-connected-artwork__image'
            height={IDENTITY_ARTWORK.height}
            loading='lazy'
            sizes='(min-width: 1024px) calc(100vw - 12rem), calc(100vw - 3rem)'
            src={IDENTITY_ARTWORK.src}
            width={IDENTITY_ARTWORK.width}
          />
        </div>
      </div>
    </EditorialSection>
  );
}

function RelationshipsSection({
  section,
}: Readonly<{ section: RelationshipSection }>) {
  return (
    <EditorialSection dataMedia='false' rhythm='text' section={section}>
      <div className='homepage-certified-section__inner'>
        <div className='homepage-certified-section__copy'>
          <h2
            id='homepage-section-relationships-heading'
            className='homepage-certified-section__headline'
            data-homepage-section-heading
          >
            {section.headline}
          </h2>
          <p className='homepage-certified-section__body'>{section.body}</p>
        </div>
        <div className='homepage-certified-section__media'>
          <RelationshipOutcomes outcomes={section.outcomes} />
        </div>
      </div>
    </EditorialSection>
  );
}

/**
 * Founder-locked editorial body. The unsupported logo proof strip is omitted
 * until an attributable adoption or permission receipt exists. The shared
 * full footer remains mounted by PublicPageShell.
 */
export function HomepageCertifiedSections({
  previews,
}: HomepageCertifiedSectionsProps) {
  void previews;
  const { sections } = HOMEPAGE_LAUNCH_COPY.certified;

  return (
    <>
      {sections.map((section): ReactNode => {
        if (section.id === 'connected') {
          return <ConnectedSection key={section.id} section={section} />;
        }
        return <RelationshipsSection key={section.id} section={section} />;
      })}
    </>
  );
}
