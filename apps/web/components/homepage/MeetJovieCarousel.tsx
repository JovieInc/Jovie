'use client';

import { Button } from '@jovie/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import type { HomepageArtistProfileCards } from './HomepageArtistProfiles';

export function ArtistProfileCardRow({
  cards,
}: Readonly<{ cards: HomepageArtistProfileCards }>) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState({
    canGoPrevious: false,
    canGoNext: cards.length > 3,
  });

  const updateScrollState = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    if (rail.clientWidth === 0) return;

    const epsilon = 1;
    const canGoPrevious = rail.scrollLeft > epsilon;
    const canGoNext =
      rail.scrollLeft + rail.clientWidth < rail.scrollWidth - epsilon;

    setScrollState(previous =>
      previous.canGoPrevious === canGoPrevious &&
      previous.canGoNext === canGoNext
        ? previous
        : { canGoPrevious, canGoNext }
    );
  }, []);

  useEffect(() => {
    updateScrollState();
    const rail = railRef.current;
    if (!rail) return;

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [updateScrollState]);

  const scrollRail = useCallback((direction: 'previous' | 'next') => {
    const rail = railRef.current;
    if (!rail) return;

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    rail.scrollBy({
      left: direction === 'next' ? rail.clientWidth : -rail.clientWidth,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, []);

  return (
    <div className='homepage-artist-profiles__carousel'>
      <nav
        aria-label='Artist Profile Preview Navigation'
        className='homepage-artist-profiles__carousel-controls'
      >
        <Button
          aria-label='Previous Artist Profile Preview'
          disabled={!scrollState.canGoPrevious}
          onClick={() => scrollRail('previous')}
          size='icon'
          type='button'
          variant='ghost'
        >
          <ChevronLeft aria-hidden='true' size={18} strokeWidth={1.9} />
        </Button>
        <Button
          aria-label='Next Artist Profile Preview'
          disabled={!scrollState.canGoNext}
          onClick={() => scrollRail('next')}
          size='icon'
          type='button'
          variant='ghost'
        >
          <ChevronRight aria-hidden='true' size={18} strokeWidth={1.9} />
        </Button>
      </nav>
      <div
        className='homepage-artist-profiles__row'
        onScroll={updateScrollState}
        ref={railRef}
      >
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
    </div>
  );
}
