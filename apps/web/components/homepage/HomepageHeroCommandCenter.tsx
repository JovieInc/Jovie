import { Badge } from '@jovie/ui/atoms/badge';
import { Button } from '@jovie/ui/atoms/button';
import { Disc3, Plus } from 'lucide-react';
import Image from 'next/image';

const RELEASE_ROWS = [
  {
    id: 'never-say-a-word',
    title: 'Never Say A Word',
    artist: 'Tim White',
    format: 'Single',
    artwork: '/img/releases/never-say-a-word.jpg',
    isPickingUp: true,
  },
  {
    id: 'the-deep-end',
    title: 'The Deep End',
    artist: 'Cosmic Gate & Tim White',
    format: 'Single',
    artwork: '/img/releases/the-deep-end.jpg',
    isPickingUp: false,
  },
  {
    id: 'take-me-over',
    title: 'Take Me Over',
    artist: 'Tim White feat. Erica Gibson',
    format: 'Single',
    artwork: '/img/releases/take-me-over.jpg',
    isPickingUp: false,
  },
  {
    id: 'all-this-noise',
    title: 'All This Noise',
    artist: 'Tim White',
    format: 'EP',
    artwork: '/images/mock-profile/tim-white-dont-look-down-card.jpg',
    isPickingUp: false,
  },
  {
    id: 'save-the-night',
    title: 'Save The Night',
    artist: 'Tim White',
    format: 'Single',
    artwork: '/images/mock-profile/tim-white-dont-look-down-card.jpg',
    isPickingUp: false,
  },
  {
    id: 'trying-too-hard',
    title: 'Trying Too Hard',
    artist: 'Tim White',
    format: 'Single',
    artwork: '/img/releases/take-me-over.jpg',
    isPickingUp: false,
  },
] as const;

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
