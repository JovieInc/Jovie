import { Button } from '@jovie/ui';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { ArtistProfileCardRow } from './MeetJovieCarousel';

export type HomepageArtistProfileCardImage = {
  readonly publicUrl: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
};

export type HomepageArtistProfileCard =
  | {
      readonly id: 'sell-out';
      readonly title: 'Sell Out';
      readonly body: string;
      readonly image: HomepageArtistProfileCardImage;
    }
  | {
      readonly id: 'capture-fans';
      readonly title: 'Capture Fans';
      readonly body: string;
      readonly image: HomepageArtistProfileCardImage;
    }
  | {
      readonly id: 'get-paid';
      readonly title: 'Get Paid';
      readonly body: string;
      readonly image: HomepageArtistProfileCardImage;
    }
  | {
      readonly id: 'drop-music';
      readonly title: 'Drop Music';
      readonly body: string;
      readonly image: HomepageArtistProfileCardImage;
    };

export type HomepageArtistProfileCards = readonly HomepageArtistProfileCard[];

export function HomepageArtistProfiles({
  cards,
}: Readonly<{ cards: HomepageArtistProfileCards }>) {
  return (
    <section
      aria-labelledby='homepage-artist-profiles-heading'
      className='homepage-artist-profiles'
      data-testid='homepage-artist-profiles'
    >
      <div className='homepage-artist-profiles__header'>
        <div className='homepage-artist-profiles__lockup'>
          <h2
            className='homepage-artist-profiles__heading'
            data-homepage-section-heading
            id='homepage-artist-profiles-heading'
          >
            Artist Profiles
          </h2>
          <p className='homepage-artist-profiles__intro'>Built to convert</p>
        </div>
        <Button
          asChild
          className='homepage-artist-profiles__action'
          static
          variant='ghost'
        >
          <Link href={APP_ROUTES.ARTIST_PROFILES}>Explore Artist Profiles</Link>
        </Button>
      </div>
      <ArtistProfileCardRow cards={cards} />
    </section>
  );
}
