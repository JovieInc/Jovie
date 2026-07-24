'use client';

import { Button } from '@jovie/ui/atoms/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { HomepageMeetJovieCards } from './HomepageMeetJovie';

const GAP_PX = 24;

export function MeetJovieCarousel({
  cards,
}: Readonly<{ cards: HomepageMeetJovieCards }>) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const updateEnds = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setAtStart(track.scrollLeft <= 1);
    setAtEnd(track.scrollLeft + track.clientWidth >= track.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateEnds();
  }, [updateEnds]);

  const scrollByCard = useCallback(
    (direction: 1 | -1) => {
      const track = trackRef.current;
      if (!track) return;
      const card = track.querySelector('li');
      const step = card
        ? card.getBoundingClientRect().width + GAP_PX
        : track.clientWidth;
      track.scrollBy({
        left: direction * step,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    },
    [prefersReducedMotion]
  );

  return (
    <div className='homepage-meet-jovie__carousel'>
      <div className='homepage-meet-jovie__controls'>
        <Button
          aria-label='Previous Outcomes'
          disabled={atStart}
          onClick={() => scrollByCard(-1)}
          size='sm'
          variant='secondary'
        >
          <ArrowLeft aria-hidden='true' size={16} />
        </Button>
        <Button
          aria-label='Next Outcomes'
          disabled={atEnd}
          onClick={() => scrollByCard(1)}
          size='sm'
          variant='secondary'
        >
          <ArrowRight aria-hidden='true' size={16} />
        </Button>
      </div>
      <ul
        aria-label='Outcomes Jovie Delivers'
        className='homepage-meet-jovie__track'
        onScroll={updateEnds}
        ref={trackRef}
      >
        {cards.map(card => (
          <li
            className='homepage-artist-outcome homepage-meet-jovie__card'
            key={card.id}
          >
            <figure className='homepage-artist-outcome__media'>
              <Image
                alt={card.image.alt}
                height={card.image.height}
                loading='lazy'
                sizes='(min-width: 768px) 24rem, 78vw'
                src={card.image.publicUrl}
                width={card.image.width}
              />
              <figcaption className='homepage-artist-outcome__caption'>
                <h3>{card.title}</h3>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
