'use client';

import { Button } from '@jovie/ui';
import Image from 'next/image';
import { useId, useState } from 'react';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import type { HomepageArtistProfileCards } from './HomepageArtistProfiles';

export function ArtistProfileCardRow({
  cards,
}: Readonly<{ cards: HomepageArtistProfileCards }>) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const id = useId();
  const selectedCard = cards[selectedIndex];

  return (
    <div className='homepage-artist-profiles__carousel'>
      <div
        aria-label='Artist Profile outcomes'
        className='homepage-artist-profiles__outcome-tabs'
        role='tablist'
      >
        {cards.map((card, index) => (
          <Button
            aria-controls={`${id}-${card.id}`}
            aria-selected={index === selectedIndex}
            className='homepage-artist-profiles__outcome-tab'
            id={`${id}-${card.id}-tab`}
            key={card.id}
            onClick={() => setSelectedIndex(index)}
            role='tab'
            size='sm'
            type='button'
            variant='ghost'
          >
            {card.title}
          </Button>
        ))}
      </div>
      <section
        aria-labelledby={`${id}-${selectedCard.id}-tab`}
        className='homepage-artist-outcome homepage-artist-profiles__stage'
        id={`${id}-${selectedCard.id}`}
        role='tabpanel'
      >
        <div className='homepage-artist-outcome__copy'>
          <h3>{selectedCard.title}</h3>
          <p>{selectedCard.body}</p>
        </div>
        <figure className='homepage-artist-outcome__media'>
          <ArtistProfilePhoneFrame className='homepage-artist-outcome__device'>
            <Image
              alt={selectedCard.image.alt}
              className='homepage-artist-outcome__screen'
              height={selectedCard.image.height}
              loading='lazy'
              quality={100}
              sizes='(min-width: 1280px) 30rem, (min-width: 768px) 46vw, 88vw'
              src={selectedCard.image.publicUrl}
              width={selectedCard.image.width}
            />
          </ArtistProfilePhoneFrame>
        </figure>
      </section>
    </div>
  );
}
