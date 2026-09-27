// @coverage-via apps/web/tests/unit/home/homepage-locked-baseline.test.tsx
import Image from 'next/image';
import type { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

export type HomepageProfileSpecimenCopy =
  (typeof HOMEPAGE_LAUNCH_COPY)['hero']['specimen'];

export const HOMEPAGE_SPECIMEN_PORTRAIT = {
  src: '/assets/generated/homepage-avery-chen-portrait-v1.webp',
  width: 128,
  height: 128,
} as const;

/**
 * Illustrative Jovie profile specimen for the homepage hero. Avery Chen is
 * fictional example content (never a customer or product evidence), so the
 * caption labels it as a preview and its action is non-interactive.
 */
export function HomepageProfileSpecimen({
  specimen,
}: Readonly<{ specimen: HomepageProfileSpecimenCopy }>) {
  return (
    <figure
      className='homepage-identity-specimen'
      data-testid='homepage-profile-specimen'
      data-illustrative='true'
    >
      <div className='homepage-identity-specimen__card'>
        <p className='homepage-identity-specimen__handle'>{specimen.handle}</p>
        <div className='homepage-identity-specimen__identity'>
          <Image
            alt={specimen.portraitAlt}
            className='homepage-identity-specimen__portrait'
            height={HOMEPAGE_SPECIMEN_PORTRAIT.height}
            priority
            sizes='64px'
            src={HOMEPAGE_SPECIMEN_PORTRAIT.src}
            width={HOMEPAGE_SPECIMEN_PORTRAIT.width}
          />
          <div className='homepage-identity-specimen__intro'>
            <p className='homepage-identity-specimen__name'>{specimen.name}</p>
            <p className='homepage-identity-specimen__bio'>{specimen.bio}</p>
          </div>
        </div>
        <ul className='homepage-identity-specimen__rows'>
          {specimen.rows.map(row => (
            <li key={row.id} className='homepage-identity-specimen__row'>
              <span className='homepage-identity-specimen__row-title'>
                {row.title}
              </span>
              <span className='homepage-identity-specimen__row-detail'>
                {row.detail}
              </span>
            </li>
          ))}
        </ul>
        {/* Illustrative and non-interactive: the page has one primary action. */}
        <span className='homepage-identity-specimen__action' aria-hidden='true'>
          {specimen.action}
        </span>
      </div>
      <figcaption className='homepage-identity-specimen__caption'>
        {specimen.caption}
      </figcaption>
    </figure>
  );
}
