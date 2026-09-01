'use client';

import { Button } from '@jovie/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import type { HomepageArtistProfilePreviews } from './HomepageArtistProfiles';

export function ArtistProfileCardRow({
  previews,
}: Readonly<{ previews: HomepageArtistProfilePreviews }>) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState({
    canGoPrevious: false,
    canGoNext: previews.length > 3,
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
        <button
          className='homepage-artist-profiles__keyboard-scroll-control sr-only'
          onClick={() => scrollRail('next')}
          type='button'
        >
          Scroll Artist Profile Previews
        </button>
        <ul
          aria-label='Jovie Artist Profile Previews'
          className='homepage-artist-profiles__track'
        >
          {previews.map(preview => (
            <li
              className='homepage-artist-profile-preview homepage-artist-profiles__card'
              key={preview.id}
            >
              <figure className='homepage-artist-profile-preview__figure'>
                <ArtistProfilePhoneFrame className='homepage-artist-profile-preview__device'>
                  <Image
                    alt={preview.image.alt}
                    className='homepage-artist-profile-preview__screen'
                    height={preview.image.height}
                    loading='lazy'
                    quality={100}
                    sizes='(min-width: 1280px) 15rem, (min-width: 768px) 21vw, 68vw'
                    src={preview.image.publicUrl}
                    width={preview.image.width}
                  />
                </ArtistProfilePhoneFrame>
                <figcaption className='homepage-artist-profile-preview__label'>
                  {preview.label}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
