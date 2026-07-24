import { MeetJovieCarousel } from './MeetJovieCarousel';

export type HomepageMeetJovieCardImage = {
  readonly publicUrl: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
};

export type HomepageMeetJovieCard =
  | {
      readonly id: 'drive-streams';
      readonly title: 'Drive Streams';
      readonly image: HomepageMeetJovieCardImage;
    }
  | {
      readonly id: 'capture-fans';
      readonly title: 'Capture Fans';
      readonly image: HomepageMeetJovieCardImage;
    }
  | {
      readonly id: 'get-paid';
      readonly title: 'Get Paid';
      readonly image: HomepageMeetJovieCardImage;
    };

export type HomepageMeetJovieCards = readonly [
  Extract<HomepageMeetJovieCard, { readonly id: 'drive-streams' }>,
  Extract<HomepageMeetJovieCard, { readonly id: 'capture-fans' }>,
  Extract<HomepageMeetJovieCard, { readonly id: 'get-paid' }>,
];

export function HomepageMeetJovie({
  cards,
}: Readonly<{ cards: HomepageMeetJovieCards }>) {
  return (
    <section
      aria-labelledby='homepage-meet-jovie-heading'
      className='homepage-meet-jovie'
      data-testid='homepage-meet-jovie'
    >
      <div className='homepage-meet-jovie__header'>
        <div className='homepage-meet-jovie__copy'>
          <h2
            className='homepage-meet-jovie__heading'
            id='homepage-meet-jovie-heading'
          >
            {/* ui-casing-allow: marketing display headline (DESIGN.md Text Casing exception) */}
            Meet Jovie
          </h2>
          <p className='homepage-meet-jovie__intro'>
            Jovie is the AI artist workspace that surfaces opportunities in your
            catalog and helps you ship the next one.
          </p>
        </div>
      </div>
      <MeetJovieCarousel cards={cards} />
    </section>
  );
}
