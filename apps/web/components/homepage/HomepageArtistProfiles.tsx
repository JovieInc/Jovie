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

export type HomepageArtistProfilePreview =
  | {
      readonly id: 'tour';
      readonly label: 'Tour';
      readonly image: HomepageArtistProfileCardImage;
    }
  | {
      readonly id: 'subscribe';
      readonly label: 'Subscribe';
      readonly image: HomepageArtistProfileCardImage;
    }
  | {
      readonly id: 'pay';
      readonly label: 'Pay';
      readonly image: HomepageArtistProfileCardImage;
    }
  | {
      readonly id: 'presave';
      readonly label: 'Presave';
      readonly image: HomepageArtistProfileCardImage;
    };

export type HomepageArtistProfilePreviews =
  readonly HomepageArtistProfilePreview[];

export function HomepageArtistProfiles({
  previews,
}: Readonly<{ previews: HomepageArtistProfilePreviews }>) {
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
      <ArtistProfileCardRow previews={previews} />
    </section>
  );
}
