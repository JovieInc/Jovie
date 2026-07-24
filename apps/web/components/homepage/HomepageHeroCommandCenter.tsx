import { Badge } from '@jovie/ui/atoms/badge';
import { Button } from '@jovie/ui/atoms/button';
import { Disc3, Plus } from 'lucide-react';
import Image from 'next/image';

interface HomepageReleaseRow {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly format: 'Single' | 'EP';
  readonly artwork: string;
  readonly isPickingUp: boolean;
}

function releaseRow(
  id: string,
  title: string,
  artist: string,
  format: HomepageReleaseRow['format'],
  artwork: string,
  isPickingUp = false
): HomepageReleaseRow {
  return { id, title, artist, format, artwork, isPickingUp };
}

const RELEASE_ROWS: readonly HomepageReleaseRow[] = [
  releaseRow(
    'never-say-a-word',
    'Never Say A Word',
    'Tim White',
    'Single',
    '/img/releases/never-say-a-word.jpg',
    true
  ),
  releaseRow(
    'the-deep-end',
    'The Deep End',
    'Cosmic Gate & Tim White',
    'Single',
    '/img/releases/the-deep-end.jpg'
  ),
  releaseRow(
    'take-me-over',
    'Take Me Over',
    'Tim White feat. Erica Gibson',
    'Single',
    '/img/releases/take-me-over.jpg'
  ),
  releaseRow(
    'all-this-noise',
    'All This Noise',
    'Tim White',
    'EP',
    '/images/mock-profile/tim-white-dont-look-down-card.jpg'
  ),
  releaseRow(
    'save-the-night',
    'Save The Night',
    'Tim White',
    'Single',
    '/images/mock-profile/tim-white-dont-look-down-card.jpg'
  ),
  releaseRow(
    'trying-too-hard',
    'Trying Too Hard',
    'Tim White',
    'Single',
    '/img/releases/take-me-over.jpg'
  ),
];

export function HomepageHeroCommandCenter() {
  return (
    <section
      aria-label='Jovie Releases Table'
      className='homepage-hero-command-center system-b-mounted-home-command-center'
      data-testid='homepage-hero-command-center'
    >
      <div className='homepage-product-rail system-b-mounted-home-command-rail'>
        <figure
          className='homepage-product-pane homepage-product-pane--desktop system-b-mounted-home-command-pane'
          data-product-pane
        >
          <div className='homepage-release-table'>
            <div className='homepage-release-table__toolbar'>
              <div className='homepage-release-table__title'>
                <Disc3 aria-hidden='true' />
                <span>Releases</span>
              </div>
              <Button size='sm' variant='secondary'>
                <Plus aria-hidden='true' />
                {/* ui-casing-allow: production releases action copy */}
                New release
              </Button>
            </div>

            <table aria-label='Releases'>
              <thead>
                <tr>
                  <th>Release</th>
                  <th className='homepage-release-table__format'>Format</th>
                  <th className='homepage-release-table__status'>Status</th>
                </tr>
              </thead>
              <tbody>
                {RELEASE_ROWS.map(release => (
                  <tr key={release.id}>
                    <td>
                      <div className='homepage-release-table__release'>
                        <Image
                          src={release.artwork}
                          alt={`${release.title} artwork`}
                          width={40}
                          height={40}
                          sizes='40px'
                          loading='eager'
                        />
                        <div>
                          <span>{release.title}</span>
                          <small>{release.artist}</small>
                        </div>
                        {release.isPickingUp ? (
                          <Badge
                            size='sm'
                            tone='info'
                            data-testid='homepage-release-picking-up'
                          >
                            {/* ui-casing-allow: design-locked momentum status */}
                            picking up
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className='homepage-release-table__format'>
                      {release.format}
                    </td>
                    <td className='homepage-release-table__status'>
                      <Badge size='sm' variant='outline'>
                        Live
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      </div>
    </section>
  );
}
