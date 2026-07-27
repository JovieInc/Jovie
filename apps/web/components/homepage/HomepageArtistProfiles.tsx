import { ArtistProfileCardRow } from './MeetJovieCarousel';

export type HomepageArtistProfileCardImage = {
  readonly publicUrl: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
};

export type HomepageArtistProfileCard =
  | {
      readonly id: 'drive-streams';
      readonly title: 'Drive Streams';
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
    };

export type HomepageArtistProfileCards = readonly [
  Extract<HomepageArtistProfileCard, { readonly id: 'drive-streams' }>,
  Extract<HomepageArtistProfileCard, { readonly id: 'capture-fans' }>,
  Extract<HomepageArtistProfileCard, { readonly id: 'get-paid' }>,
];

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
        <h2
          className='homepage-artist-profiles__heading'
          data-homepage-section-heading
          id='homepage-artist-profiles-heading'
        >
          Artist Profiles
        </h2>
        <p className='homepage-artist-profiles__intro'>
          One artist presence for the next release, fan capture, and direct
          support.
        </p>
      </div>
      <ArtistProfileCardRow cards={cards} />
    </section>
  );
}
