import Image from 'next/image';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import type { HomepageArtistProfileCards } from './HomepageArtistProfiles';

export function ArtistProfileCardRow({
  cards,
}: Readonly<{ cards: HomepageArtistProfileCards }>) {
  return (
    <div className='homepage-artist-profiles__row'>
      <ul
        aria-label='Jovie Artist Profile Outcomes'
        className='homepage-artist-profiles__track'
      >
        {cards.map(card => (
          <li
            className='homepage-artist-outcome homepage-artist-profiles__card'
            key={card.id}
          >
            <div className='homepage-artist-outcome__copy'>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </div>
            <figure className='homepage-artist-outcome__media'>
              <ArtistProfilePhoneFrame className='homepage-artist-outcome__device'>
                <Image
                  alt={card.image.alt}
                  className='homepage-artist-outcome__screen'
                  height={card.image.height}
                  loading='lazy'
                  quality={100}
                  sizes='(min-width: 1280px) 13rem, (min-width: 768px) 16vw, 44vw'
                  src={card.image.publicUrl}
                  width={card.image.width}
                />
              </ArtistProfilePhoneFrame>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
