// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
import Image from 'next/image';
import type { ReactNode } from 'react';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import type { MarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export type HomepageCertifiedSectionId =
  (typeof HOMEPAGE_LAUNCH_COPY.certified.sections)[number]['id'];

/**
 * Real public-profile exports for the approved customer-zero example
 * (jov.ie/tim). `connected` is the single profile surface shown under the
 * identity headline; `relationships` is the People state of the static
 * visibility artifact beside the shipped `{username}/llms.txt` surface.
 */
export interface HomepageCertifiedPreviews {
  readonly connected: MarketingExportImage;
  readonly relationships: MarketingExportImage;
}

export interface HomepageCertifiedSectionsProps {
  readonly previews: HomepageCertifiedPreviews;
}

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

function ProfileSurface({ image }: Readonly<{ image: MarketingExportImage }>) {
  return (
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
        sizes='(min-width: 900px) 15rem, 62vw'
        src={image.publicUrl}
        width={image.width}
      />
    </ArtistProfilePhoneFrame>
  );
}

function ConnectedSection({
  image,
  section,
}: Readonly<{
  image: MarketingExportImage;
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
        <div
          className='homepage-connected-artwork homepage-chapter-visual'
          data-homepage-visual='connected'
        >
          <div className='homepage-connected-profile'>
            <div className='homepage-connected-profile__identity'>
              <Image
                alt=''
                className='homepage-connected-profile__avatar'
                height={96}
                src={TIM_WHITE_PROFILE.avatarSrc}
                width={96}
              />
              <p className='homepage-connected-profile__name'>
                {TIM_WHITE_PROFILE.name}
              </p>
              <p className='homepage-connected-profile__url'>
                {TIM_WHITE_PROFILE.publicProfileDisplay}
              </p>
            </div>
            <Image
              alt={image.alt}
              className='homepage-connected-artwork__image'
              height={image.height}
              loading='lazy'
              sizes='(min-width: 1362px) 320px, 40vw'
              src={image.publicUrl}
              width={image.width}
            />
          </div>
        </div>
      </div>
    </EditorialSection>
  );
}

/**
 * Static ordered states of the shipped visibility surfaces for the same
 * profile: the public page people read and the per-profile llms.txt agents
 * read (documented on /developers). Both states are current product, so no
 * transformation or simulated third-party answer is needed.
 */
function RelationshipVisibility({
  peopleImage,
}: Readonly<{ peopleImage: MarketingExportImage }>) {
  return (
    <ol
      className='homepage-relationship-visibility'
      aria-label='One Profile, Legible To People And To Agents'
    >
      <li
        className='homepage-relationship-visibility__state'
        data-audience='people'
      >
        <span className='homepage-relationship-visibility__label'>People</span>
        <div className='homepage-relationship-visibility__artifact'>
          <ProfileSurface image={peopleImage} />
          <p className='homepage-relationship-visibility__url'>
            {TIM_WHITE_PROFILE.publicProfileDisplay}
          </p>
        </div>
      </li>
      <li
        className='homepage-relationship-visibility__state'
        data-audience='agents'
      >
        <span className='homepage-relationship-visibility__label'>Agents</span>
        <div className='homepage-relationship-visibility__artifact'>
          <pre className='homepage-relationship-visibility__llms'>
            {`# ${TIM_WHITE_PROFILE.name}\n- **Canonical URL**: ${TIM_WHITE_PROFILE.publicProfileUrl}\n- **Handle**: @${TIM_WHITE_PROFILE.publicProfileHandle}`}
          </pre>
          <p className='homepage-relationship-visibility__url'>
            {`${TIM_WHITE_PROFILE.publicProfileDisplay}/llms.txt`}
          </p>
        </div>
      </li>
    </ol>
  );
}

function RelationshipsSection({
  image,
  section,
}: Readonly<{
  image: MarketingExportImage;
  section: RelationshipSection;
}>) {
  return (
    <EditorialSection dataMedia='true' rhythm='product' section={section}>
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
        <div
          className='homepage-certified-section__media homepage-chapter-visual homepage-relationships-visual'
          data-homepage-visual='relationships'
        >
          <RelationshipOutcomes outcomes={section.outcomes} />
          <RelationshipVisibility peopleImage={image} />
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
  const { sections } = HOMEPAGE_LAUNCH_COPY.certified;

  return (
    <>
      {sections.map((section): ReactNode => {
        if (section.id === 'connected') {
          return (
            <ConnectedSection
              image={previews.connected}
              key={section.id}
              section={section}
            />
          );
        }
        return (
          <RelationshipsSection
            image={previews.relationships}
            key={section.id}
            section={section}
          />
        );
      })}
    </>
  );
}
