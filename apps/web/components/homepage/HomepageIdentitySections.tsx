// @coverage-via apps/web/tests/unit/home/HomepageIdentitySections.test.tsx
import {
  CalendarDays,
  CreditCard,
  Link2,
  type LucideIcon,
  UserRound,
} from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import './HomepageIdentity.css';

type HomepageSection = (typeof HOMEPAGE_IDENTITY_COPY.sections)[number];
type PresenceSectionCopy = Extract<HomepageSection, { id: 'presence' }>;
type StructureSectionCopy = Extract<HomepageSection, { id: 'structure' }>;
type PossibilityId =
  StructureSectionCopy['possibilities']['items'][number]['id'];

export type HomepageIdentitySectionId = HomepageSection['id'];

/**
 * The purple satin material belongs to the presence strip only. The hero owns
 * the blue technical texture; no background image is used twice on `/`.
 */
export const HOMEPAGE_PRESENCE_MATERIAL = {
  src: '/assets/generated/homepage-presence-satin-v1.webp',
  width: 1672,
  height: 941,
} as const;

const POSSIBILITY_ICONS: Readonly<Record<PossibilityId, LucideIcon>> = {
  profile: UserRound,
  links: Link2,
  events: CalendarDays,
  payments: CreditCard,
};

function EditorialSection({
  children,
  section,
  dataMedia,
}: Readonly<{
  children: ReactNode;
  section: HomepageSection;
  dataMedia: 'true' | 'false';
}>) {
  return (
    <section
      id={section.id}
      className={`homepage-identity-section homepage-identity-section--${section.id}`}
      data-testid='marketing-section-feature-split'
      data-homepage-testid={`homepage-section-${section.id}`}
      data-marketing-owner='apps/web/components/homepage/HomepageIdentitySections.tsx'
      data-marketing-variant='editorial'
      data-marketing-occurrence={section.id}
      data-media={dataMedia}
      aria-labelledby={`homepage-section-${section.id}-heading`}
    >
      <div className='homepage-identity-section__inner'>
        <div className='homepage-identity-section__header'>
          <div>
            <p className='homepage-identity-section__eyebrow'>
              {section.eyebrow}
            </p>
            <h2
              id={`homepage-section-${section.id}-heading`}
              className='homepage-identity-section__headline'
              data-homepage-section-heading
            >
              {section.headline}
            </h2>
          </div>
          <p className='homepage-identity-section__body'>{section.body}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function PresenceSection({
  section,
}: Readonly<{ section: PresenceSectionCopy }>) {
  return (
    <EditorialSection section={section} dataMedia='true'>
      <div
        className='homepage-identity-presence__material'
        aria-hidden='true'
        data-background-image={HOMEPAGE_PRESENCE_MATERIAL.src}
        data-testid='homepage-presence-material'
      >
        <Image
          alt=''
          className='homepage-identity-presence__material-image'
          fill
          loading='lazy'
          sizes='(min-width: 1440px) 1298px, 100vw'
          src={HOMEPAGE_PRESENCE_MATERIAL.src}
        />
      </div>
      <div className='homepage-identity-presence__step'>
        <h3 className='homepage-identity-presence__step-headline'>
          {section.step.headline}
        </h3>
        <p className='homepage-identity-section__body'>{section.step.body}</p>
      </div>
    </EditorialSection>
  );
}

function StructureSection({
  section,
}: Readonly<{ section: StructureSectionCopy }>) {
  const { identity, possibilities } = section;

  return (
    <EditorialSection section={section} dataMedia='false'>
      <div className='homepage-identity-structure__anatomy'>
        <div
          className='homepage-identity-structure__column'
          data-testid='homepage-structure-identity'
        >
          <p className='homepage-identity-structure__label'>{identity.label}</p>
          {/* The profile avatar slot of the anatomy, not a decorative badge. */}
          <span
            className='homepage-identity-structure__avatar'
            aria-hidden='true'
          >
            <UserRound size={18} strokeWidth={1.6} />
          </span>
          <h3 className='homepage-identity-structure__title'>
            {identity.title}
          </h3>
          <p className='homepage-identity-structure__handle'>
            {identity.handle}
          </p>
        </div>
        <div
          className='homepage-identity-structure__column'
          data-testid='homepage-structure-possibilities'
        >
          <p className='homepage-identity-structure__label'>
            {possibilities.label}
          </p>
          <ul
            className='homepage-identity-structure__list'
            aria-label='Profile Possibilities'
          >
            {possibilities.items.map(item => {
              const Icon = POSSIBILITY_ICONS[item.id];
              return (
                <li
                  key={item.id}
                  className='homepage-identity-structure__item'
                  data-homepage-testid={`homepage-possibility-${item.id}`}
                >
                  <Icon
                    aria-hidden='true'
                    className='homepage-identity-structure__icon'
                    size={18}
                    strokeWidth={1.6}
                  />
                  <p className='homepage-identity-structure__item-title'>
                    {item.title}
                  </p>
                  <p className='homepage-identity-structure__item-detail'>
                    {item.detail}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </EditorialSection>
  );
}

/**
 * Canonical Pen homepage v3 body (2026-09-26, dark launch): the presence sequence (headline,
 * purple satin material strip, a clear next step) and the open-system anatomy
 * (your Jovie profile and what it holds). The shared full footer remains
 * mounted by PublicPageShell.
 */
export function HomepageIdentitySections() {
  const { sections } = HOMEPAGE_IDENTITY_COPY;

  return (
    <>
      {sections.map((section): ReactNode => {
        if (section.id === 'presence') {
          return <PresenceSection key={section.id} section={section} />;
        }
        return <StructureSection key={section.id} section={section} />;
      })}
    </>
  );
}
