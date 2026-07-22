import Image from 'next/image';

export type HomepageArtistOutcomeImage = {
  readonly publicUrl: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
};

export type HomepageArtistOutcomeCard =
  | {
      readonly id: 'drive-streams';
      readonly title: 'Drive Streams';
      readonly image: HomepageArtistOutcomeImage;
    }
  | {
      readonly id: 'capture-fans';
      readonly title: 'Capture Fans';
      readonly image: HomepageArtistOutcomeImage;
    }
  | {
      readonly id: 'get-paid';
      readonly title: 'Get Paid';
      readonly image: HomepageArtistOutcomeImage;
    };

export type HomepageArtistOutcomeCards = readonly [
  Extract<HomepageArtistOutcomeCard, { readonly id: 'drive-streams' }>,
  Extract<HomepageArtistOutcomeCard, { readonly id: 'capture-fans' }>,
  Extract<HomepageArtistOutcomeCard, { readonly id: 'get-paid' }>,
];

export function HomepageArtistOutcomes({
  cards,
}: Readonly<{ cards: HomepageArtistOutcomeCards }>) {
  return (
    <section
      aria-labelledby='homepage-artist-outcomes-heading'
      className='homepage-artist-outcomes'
      data-testid='homepage-artist-outcomes'
    >
      <div className='homepage-artist-outcomes__inner'>
        <div className='homepage-artist-outcomes__copy'>
          <h2 id='homepage-artist-outcomes-heading'>
            {/* ui-casing-allow: marketing display headline (DESIGN.md Text Casing exception) */}
            Every fan has a next move.
          </h2>
          <p>Drive streams. Capture fans. Get paid.</p>
        </div>

        <ol
          aria-label='Artist Outcomes'
          className='homepage-artist-outcomes__list'
        >
          {cards.map(card => (
            <li key={card.id} className='homepage-artist-outcome'>
              <figure className='homepage-artist-outcome__media'>
                <Image
                  src={card.image.publicUrl}
                  alt={card.image.alt}
                  width={card.image.width}
                  height={card.image.height}
                  sizes='(min-width: 1360px) 390px, (min-width: 768px) 30vw, calc(100vw - 3rem)'
                  loading='lazy'
                />
                <figcaption className='homepage-artist-outcome__caption'>
                  <h3>{card.title}</h3>
                </figcaption>
              </figure>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
